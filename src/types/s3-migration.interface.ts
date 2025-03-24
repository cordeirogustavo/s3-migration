import { S3Client } from '@aws-sdk/client-s3';

export interface S3Config {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface S3MigrationOptions {
  sourceBucket: string;
  destinationBucket: string;
  sourceConfig: S3Config;
  destinationConfig: S3Config;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export interface MigrationResult {
  key: string;
  status: 'Copied' | 'Skipped' | 'Error';
  error?: string;
  size?: number;
  lastModified?: Date;
}

export interface IS3MigrationService {
  migrate(options: S3MigrationOptions): Promise<MigrationResult[]>;
  listObjects(bucket: string, client: S3Client): Promise<S3Object[]>;
  copyObject(
    sourceKey: string,
    destinationKey: string,
    sourceClient: S3Client,
    destinationClient: S3Client,
    sourceBucket: string,
    destinationBucket: string
  ): Promise<void>;
  objectExists(key: string, client: S3Client, bucket: string): Promise<boolean>;
}
