# S3 Migration Tool

A TypeScript-based tool for migrating objects between AWS S3 buckets across different AWS accounts.

## Features

- Recursive listing of all objects in the source bucket
- Efficient copying of objects between buckets
- Skip existing objects to avoid duplicates
- Detailed logging and error handling
- Progress tracking and summary reporting

## Prerequisites

- Node.js (v14 or higher)
- AWS credentials for both source and destination accounts
- TypeScript knowledge for development

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd s3-migration
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment example file and fill in your AWS credentials:
```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file with your AWS credentials and bucket information:

```env
# Source AWS Configuration
SOURCE_AWS_REGION=us-east-1
SOURCE_AWS_ACCESS_KEY_ID=your_source_access_key
SOURCE_AWS_SECRET_ACCESS_KEY=your_source_secret_key
SOURCE_BUCKET=your_source_bucket_name

# Destination AWS Configuration
DESTINATION_AWS_REGION=us-east-1
DESTINATION_AWS_ACCESS_KEY_ID=your_destination_access_key
DESTINATION_AWS_SECRET_ACCESS_KEY=your_destination_secret_key
DESTINATION_BUCKET=your_destination_bucket_name
```

## Usage

1. Build the project:
```bash
npm run build
```

2. Run the migration:
```bash
npm start
```

For development with hot-reload:
```bash
npm run dev
```

## Development

- `npm run build` - Build the TypeScript project
- `npm run dev` - Run in development mode with hot-reload
- `npm test` - Run tests
- `npm run lint` - Run linter
- `npm run format` - Format code

## Project Structure

```
src/
├── services/
│   └── s3-migration.service.ts    # Core migration logic
├── types/
│   └── s3-migration.interface.ts  # TypeScript interfaces
├── utils/
│   └── logger.ts                  # Logging utility
└── index.ts                       # Application entry point
```

## Error Handling

The tool provides detailed error logging and continues processing even if individual objects fail to copy. A summary of the migration results is displayed at the end, showing:
- Total objects processed
- Number of objects copied
- Number of objects skipped
- Number of errors encountered

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 