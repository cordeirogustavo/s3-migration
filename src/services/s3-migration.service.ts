import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  _Object,
} from "@aws-sdk/client-s3";
import {
  IS3MigrationService,
  S3MigrationOptions,
  S3Object,
  MigrationResult,
} from "../types/s3-migration.interface";
import { logger } from "../utils/logger";
import { Readable } from 'stream';
import { Upload } from "@aws-sdk/lib-storage";

export class S3MigrationService implements IS3MigrationService {
  private createS3Client(config: S3MigrationOptions['sourceConfig']): S3Client {
    return new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
      },
    });
  }

  async migrate(options: S3MigrationOptions): Promise<MigrationResult[]> {
    logger.info('Starting migration with config:', {
      sourceBucket: options.sourceBucket,
      destinationBucket: options.destinationBucket,
      sourceRegion: options.sourceConfig.region,
      destinationRegion: options.destinationConfig.region,
    });

    const sourceClient = this.createS3Client(options.sourceConfig);
    const destinationClient = this.createS3Client(options.destinationConfig);

    try {
      try {
        const testCommand = new ListObjectsV2Command({
          Bucket: options.sourceBucket,
          MaxKeys: 1,
        });
        await sourceClient.send(testCommand);
        logger.info('Successfully connected to source bucket');
      } catch (error) {
        logger.error('Error accessing source bucket:', {
          bucket: options.sourceBucket,
          error: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'UnknownError',
        });
        throw new Error(`Failed to access source bucket: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      try {
        const testCommand = new ListObjectsV2Command({
          Bucket: options.destinationBucket,
          MaxKeys: 1,
        });
        await destinationClient.send(testCommand);
        logger.info('Successfully connected to destination bucket');
      } catch (error) {
        logger.error('Error accessing destination bucket:', {
          bucket: options.destinationBucket,
          error: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'UnknownError',
        });
        throw new Error(`Failed to access destination bucket: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

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
              status: "Skipped",
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
            status: "Copied",
            size: obj.size,
            lastModified: obj.lastModified,
          });
          logger.info(`Copied object: ${obj.key}`);
        } catch (error) {
          const errorDetails = {
            key: obj.key,
            error: error instanceof Error ? error.message : "Unknown error",
            errorName: error instanceof Error ? error.name : "UnknownError",
            sourceBucket: options.sourceBucket,
            destinationBucket: options.destinationBucket,
          };
          
          logger.error(`Error processing object:`, errorDetails);
          
          results.push({
            key: obj.key,
            status: "Error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return results;
    } catch (error) {
      const errorDetails = {
        error: error instanceof Error ? error.message : "Unknown error",
        errorName: error instanceof Error ? error.name : "UnknownError",
        sourceBucket: options.sourceBucket,
        destinationBucket: options.destinationBucket,
      };
      logger.error("Migration failed:", errorDetails);
      throw error;
    }
  }

  async listObjects(bucket: string, client: S3Client): Promise<S3Object[]> {
    const objects: S3Object[] = [];
    let continuationToken: string | undefined;

    do {
      try {
        const command = new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        });

        const response = await client.send(command);

        if (response.Contents) {
          objects.push(
            ...response.Contents.map((item: _Object) => ({
              key: item.Key || "",
              size: item.Size || 0,
              lastModified: item.LastModified || new Date(),
              etag: item.ETag || "",
            }))
          );
        }

        continuationToken = response.NextContinuationToken;
      } catch (error) {
        logger.error('Error listing objects:', {
          bucket,
          error: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'UnknownError',
        });
        throw error;
      }
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
    try {
      const getCommand = new GetObjectCommand({
        Bucket: sourceBucket,
        Key: sourceKey,
      });

      logger.debug('Getting object from source:', {
        sourceKey,
        sourceBucket,
      });

      const { Body, ContentType, ContentLength } = await sourceClient.send(getCommand);

      if (!Body) {
        throw new Error('Empty object body received from source');
      }

      const upload = new Upload({
        client: destinationClient,
        params: {
          Bucket: destinationBucket,
          Key: destinationKey,
          Body: Body instanceof Readable ? Body : Readable.from(Body as any),
          ContentType,
          ContentLength,
        },
        queueSize: 4,
        partSize: 1024 * 1024 * 5,
        leavePartsOnError: false,
      });

      logger.debug('Starting multipart upload:', {
        destinationKey,
        destinationBucket,
        contentType: ContentType,
        contentLength: ContentLength,
      });

      await upload.done();

      logger.debug('Multipart upload completed successfully');
    } catch (error) {
      logger.error('Error copying object:', {
        sourceKey,
        destinationKey,
        sourceBucket,
        destinationBucket,
        error: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  async objectExists(
    key: string,
    client: S3Client,
    bucket: string
  ): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NotFound" || error.name === "NoSuchKey")
      ) {
        return false;
      }
      logger.error('Error checking if object exists:', {
        key,
        bucket,
        error: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }
}
