import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  _Object,
} from '@aws-sdk/client-s3';
import {
  IS3MigrationService,
  S3MigrationOptions,
  S3Object,
  MigrationResult,
} from '../types/s3-migration.interface';
import { logger } from '../utils/logger';

export class S3MigrationService implements IS3MigrationService {
  async migrate(options: S3MigrationOptions): Promise<MigrationResult[]> {
    const sourceClient = new S3Client(options.sourceConfig);
    const destinationClient = new S3Client(options.destinationConfig);

    try {
      const objects = await this.listObjects(options.sourceBucket, sourceClient);
      const results: MigrationResult[] = [];

      for (const obj of objects) {
        try {
          const exists = await this.objectExists(
            obj.key,
            destinationClient,
            options.destinationBucket
          );

          if (exists) {
            results.push({
              key: obj.key,
              status: 'Skipped',
              size: obj.size,
              lastModified: obj.lastModified,
            });
            logger.info(`Skipped existing object: ${obj.key}`);
            continue;
          }

          await this.copyObject(
            obj.key,
            obj.key,
            sourceClient,
            destinationClient,
            options.sourceBucket,
            options.destinationBucket
          );

          results.push({
            key: obj.key,
            status: 'Copied',
            size: obj.size,
            lastModified: obj.lastModified,
          });
          logger.info(`Copied object: ${obj.key}`);
        } catch (error) {
          results.push({
            key: obj.key,
            status: 'Error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          logger.error(`Error processing object ${obj.key}:`, error);
        }
      }

      return results;
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  async listObjects(bucket: string, client: S3Client): Promise<S3Object[]> {
    const objects: S3Object[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      if (response.Contents) {
        objects.push(
          ...response.Contents.map((item: _Object) => ({
            key: item.Key || '',
            size: item.Size || 0,
            lastModified: item.LastModified || new Date(),
            etag: item.ETag || '',
          }))
        );
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async copyObject(
    sourceKey: string,
    destinationKey: string,
    sourceClient: S3Client,
    destinationClient: S3Client,
    sourceBucket: string,
    destinationBucket: string
  ): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: destinationBucket,
      CopySource: `${sourceBucket}/${sourceKey}`,
      Key: destinationKey,
    });

    await destinationClient.send(command);
  }

  async objectExists(key: string, client: S3Client, bucket: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch (error) {
      if (error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) {
        return false;
      }
      throw error;
    }
  }
}
