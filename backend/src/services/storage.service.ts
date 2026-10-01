import * as Minio from 'minio';
import { Readable } from 'stream';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { normalizeUploadedFileName } from '../utils/file-upload';
import { optimizeImageSet } from '../utils/image-optimize.utils';

class StorageService {
  private minioClient: Minio.Client;
  private bucketName: string;
  private privateBucketName: string;
  private ensureBucketPromise: Promise<void> | null = null;
  private readonly ensureBucketRetryDelayMs = 3000;
  private readonly ensureBucketMaxAttempts = 20;
  private static readonly PRIVATE_REF_PREFIX = 'private:';

  private getPublicReadPolicy(bucketName: string): string {
    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    });
  }

  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    this.bucketName = config.minio.bucketName;
    this.privateBucketName = config.minio.privateBucketName;
    void this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.ensureBucketPromise) {
      return this.ensureBucketPromise;
    }

    this.ensureBucketPromise = this.ensureBucketExistsWithRetry();

    try {
      await this.ensureBucketPromise;
    } finally {
      this.ensureBucketPromise = null;
    }
  }

  private async ensureBucketExistsWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= this.ensureBucketMaxAttempts; attempt += 1) {
      const isLastAttempt = attempt === this.ensureBucketMaxAttempts;

      try {
        const exists = await this.minioClient.bucketExists(this.bucketName);
        if (!exists) {
          await this.minioClient.makeBucket(this.bucketName, config.minio.region);
          console.log(`✅ Created bucket: ${this.bucketName}`);
        }

        // Re-apply the public policy on startup as a safety net.
        await this.minioClient.setBucketPolicy(
          this.bucketName,
          this.getPublicReadPolicy(this.bucketName)
        );

        const privateExists = await this.minioClient.bucketExists(this.privateBucketName);
        if (!privateExists) {
          await this.minioClient.makeBucket(this.privateBucketName, config.minio.region);
          console.log(`✅ Created private bucket: ${this.privateBucketName}`);
        }

        return;
      } catch (error) {
        if (isLastAttempt) {
          console.error('❌ Error ensuring bucket exists:', error);
          return;
        }

        console.warn(
          `MinIO bucket '${this.bucketName}' is not ready yet (${attempt}/${this.ensureBucketMaxAttempts}). Retrying in ${
            this.ensureBucketRetryDelayMs / 1000
          }s...`
        );
        await new Promise((resolve) => setTimeout(resolve, this.ensureBucketRetryDelayMs));
      }
    }
  }

  private async ensureBucketReady(): Promise<void> {
    try {
      await this.ensureBucketExists();
    } catch (error) {
      console.error('❌ Error waiting for bucket readiness:', error);
    }
  }

  private async putPublicObject(
    objectName: string,
    buffer: Buffer,
    contentType: string,
    originalName: string
  ): Promise<string> {
    await this.minioClient.putObject(
      this.bucketName,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': contentType,
        'Original-Name': originalName,
        'Cache-Control': 'public, max-age=31536000, immutable',
      }
    );
    return this.getPublicUrl(objectName);
  }

  /**
   * Upload a file to MinIO.
   * Raster images are converted to WebP (max 1600px) + optional 800px sibling for srcset.
   * @param file - Multer file object
   * @param folder - Folder path in bucket (e.g., 'products', 'lookbook')
   * @returns Public URL of the uploaded file
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads'
  ): Promise<string> {
    try {
      await this.ensureBucketReady();

      const normalizedOriginalName = normalizeUploadedFileName(file.originalname);
      const id = uuidv4();
      const optimized = await optimizeImageSet(file.buffer, file.mimetype);

      if (optimized) {
        const primaryName = `${folder}/${id}${optimized.primary.extension}`;
        const publicUrl = await this.putPublicObject(
          primaryName,
          optimized.primary.buffer,
          optimized.primary.contentType,
          normalizedOriginalName
        );

        if (optimized.small) {
          const smallName = `${folder}/${id}-800${optimized.small.extension}`;
          try {
            await this.putPublicObject(
              smallName,
              optimized.small.buffer,
              optimized.small.contentType,
              normalizedOriginalName
            );
          } catch (smallError) {
            console.warn('Failed to upload 800w image variant:', smallError);
          }
        }

        return publicUrl;
      }

      const fileExtension = path.extname(normalizedOriginalName);
      const fileName = `${folder}/${id}${fileExtension}`;
      return await this.putPublicObject(
        fileName,
        file.buffer,
        file.mimetype,
        normalizedOriginalName
      );
    } catch (error) {
      console.error('Error uploading file to MinIO:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Upload multiple files to MinIO
   * @param files - Array of Multer file objects
   * @param folder - Folder path in bucket
   * @returns Array of public URLs
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder: string = 'uploads'
  ): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  async uploadPrivateFile(
    file: Express.Multer.File,
    folder: string = 'private'
  ): Promise<string> {
    try {
      await this.ensureBucketReady();

      const normalizedOriginalName = normalizeUploadedFileName(file.originalname);
      const fileExtension = path.extname(normalizedOriginalName);
      const objectName = `${folder}/${uuidv4()}${fileExtension}`;
      const metaData = {
        'Content-Type': file.mimetype,
        'Original-Name': normalizedOriginalName,
        'Cache-Control': 'private, no-store',
      };

      await this.minioClient.putObject(
        this.privateBucketName,
        objectName,
        file.buffer,
        file.size,
        metaData
      );

      return `${StorageService.PRIVATE_REF_PREFIX}${objectName}`;
    } catch (error) {
      console.error('Error uploading private file to MinIO:', error);
      throw new Error('Failed to upload private file to storage');
    }
  }

  /**
   * Delete a file from MinIO
   * @param fileUrl - Public URL or object name
   * @returns true if deleted successfully
   */
  async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      await this.ensureBucketReady();

      const location = this.resolveFileLocation(fileUrl);
      if (!location) {
        throw new Error('Invalid file URL');
      }

      await this.minioClient.removeObject(location.bucketName, location.objectName);
      return true;
    } catch (error) {
      console.error('Error deleting file from MinIO:', error);
      return false;
    }
  }

  /**
   * Delete multiple files from MinIO
   * @param fileUrls - Array of public URLs or object names
   * @returns Array of deletion results
   */
  async deleteFiles(fileUrls: string[]): Promise<boolean[]> {
    const deletePromises = fileUrls.map((url) => this.deleteFile(url));
    return Promise.all(deletePromises);
  }

  /**
   * Get public URL for an object
   * @param objectName - Object name in bucket
   * @returns Public URL
   */
  private getPublicUrl(objectName: string): string {
    const normalizedBase = config.minio.publicUrl.replace(/\/+$/, '');

    try {
      const url = new URL(normalizedBase);
      const currentPath = url.pathname.replace(/\/+$/, '');
      const bucketPath = `/${this.bucketName}`;
      const basePath = currentPath.endsWith(bucketPath)
        ? currentPath
        : `${currentPath}${bucketPath}`;

      url.pathname = `${basePath}/${objectName}`;
      return url.toString();
    } catch {
      const basePath = normalizedBase.endsWith(`/${this.bucketName}`)
        ? normalizedBase
        : `${normalizedBase}/${this.bucketName}`;
      return `${basePath}/${objectName}`;
    }
  }

  private resolveFileLocation(fileUrl: string): { bucketName: string; objectName: string } | null {
    if (!fileUrl || typeof fileUrl !== 'string') return null;

    if (fileUrl.startsWith(StorageService.PRIVATE_REF_PREFIX)) {
      const objectName = fileUrl.slice(StorageService.PRIVATE_REF_PREFIX.length).trim();
      if (!objectName) return null;
      return {
        bucketName: this.privateBucketName,
        objectName,
      };
    }

    const objectName = this.extractObjectName(fileUrl);
    if (!objectName) return null;
    return {
      bucketName: this.bucketName,
      objectName,
    };
  }

  getPublicObjectHttpUrl(objectKey: string): string {
    return this.getPublicUrl(objectKey);
  }

  private async streamFromPublicHttpUrl(
    url: string,
    range?: { start: number; end: number }
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength: number;
    etag?: string;
    totalSize: number;
  } | null> {
    try {
      const headers: Record<string, string> = {};
      if (range) {
        headers.Range = `bytes=${range.start}-${range.end}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok && response.status !== 206) {
        console.warn('[Storage] HTTP fetch failed:', url, response.status);
        return null;
      }

      if (!response.body) {
        return null;
      }

      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      const etag = response.headers.get('etag') ?? undefined;
      const contentLengthHeader = response.headers.get('content-length');
      const contentRange = response.headers.get('content-range');
      let contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0;
      let totalSize = contentLength;

      if (contentRange) {
        const match = /\/(\d+)$/.exec(contentRange);
        if (match) {
          totalSize = Number.parseInt(match[1], 10);
        }
        if (range) {
          contentLength = range.end - range.start + 1;
        }
      }

      return {
        stream: Readable.fromWeb(response.body as import('stream/web').ReadableStream),
        contentType,
        contentLength: Number.isFinite(contentLength) ? contentLength : 0,
        etag,
        totalSize: Number.isFinite(totalSize) ? totalSize : contentLength,
      };
    } catch (error) {
      console.warn('[Storage] HTTP fetch error:', url, error);
      return null;
    }
  }

  async getPublicObjectStream(
    objectKey: string
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength: number;
    etag?: string;
  } | null> {
    try {
      await this.ensureBucketReady();

      const stat = await this.minioClient.statObject(this.bucketName, objectKey);
      const stream = await this.minioClient.getObject(this.bucketName, objectKey);
      const meta = stat.metaData ?? {};
      const contentType =
        meta['content-type'] ??
        meta['Content-Type'] ??
        'application/octet-stream';

      return {
        stream,
        contentType,
        contentLength: stat.size,
        etag: stat.etag,
      };
    } catch (error) {
      console.warn('[Storage] MinIO getPublicObjectStream failed, trying HTTP:', objectKey, error);
    }

    const httpPayload = await this.streamFromPublicHttpUrl(this.getPublicObjectHttpUrl(objectKey));
    if (!httpPayload) {
      return null;
    }

    return {
      stream: httpPayload.stream,
      contentType: httpPayload.contentType,
      contentLength: httpPayload.totalSize || httpPayload.contentLength,
      etag: httpPayload.etag,
    };
  }

  async getPublicObjectRange(
    objectKey: string,
    start: number,
    end: number
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength: number;
  } | null> {
    try {
      await this.ensureBucketReady();

      const stat = await this.minioClient.statObject(this.bucketName, objectKey);
      const length = end - start + 1;
      const stream = await this.minioClient.getPartialObject(
        this.bucketName,
        objectKey,
        start,
        length
      );
      const meta = stat.metaData ?? {};
      const contentType =
        meta['content-type'] ??
        meta['Content-Type'] ??
        'application/octet-stream';

      return {
        stream,
        contentType,
        contentLength: length,
      };
    } catch (error) {
      console.warn('[Storage] MinIO getPublicObjectRange failed, trying HTTP:', objectKey, error);
    }

    const httpPayload = await this.streamFromPublicHttpUrl(
      this.getPublicObjectHttpUrl(objectKey),
      { start, end }
    );
    if (!httpPayload) {
      return null;
    }

    return {
      stream: httpPayload.stream,
      contentType: httpPayload.contentType,
      contentLength: httpPayload.contentLength,
    };
  }

  private extractObjectName(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      while (pathParts[0] === this.bucketName) {
        pathParts.shift();
      }

      return pathParts.join('/') || null;
    } catch {
      return url;
    }
  }

  /**
   * Read file bytes from MinIO by public URL or object name.
   */
  async getFileBuffer(
    fileUrl: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      await this.ensureBucketReady();

      const location = this.resolveFileLocation(fileUrl);
      if (!location) {
        return null;
      }

      const stat = await this.minioClient.statObject(location.bucketName, location.objectName);
      const stream = await this.minioClient.getObject(location.bucketName, location.objectName);
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });

      const meta = stat.metaData ?? {};
      const contentType =
        meta['content-type'] ??
        meta['Content-Type'] ??
        'application/octet-stream';

      return {
        buffer: Buffer.concat(chunks),
        contentType,
      };
    } catch (error) {
      console.warn('[Storage] getFileBuffer failed:', error);
      return null;
    }
  }

  /**
   * Check if file exists
   * @param fileUrl - Public URL or object name
   * @returns true if file exists
   */
  async fileExists(fileUrl: string): Promise<boolean> {
    try {
      await this.ensureBucketReady();

      const location = this.resolveFileLocation(fileUrl);
      if (!location) {
        return false;
      }

      await this.minioClient.statObject(location.bucketName, location.objectName);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const storageService = new StorageService();
