import os
import logging
from datetime import datetime
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='[%(asctime)s] %(levelname)s: %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S',
                    filename='update_r2_path.log',
                    filemode='a')

console = logging.StreamHandler()
console.setLevel(logging.INFO)
formatter = logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s')
console.setFormatter(formatter)
logging.getLogger('').addHandler(console)

# Supabase configuration
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError('SUPABASE_URL and SUPABASE_KEY must be set in .env file')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# R2 configuration
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME')
R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID')

if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ACCOUNT_ID]):
    raise ValueError('R2 credentials must be set in .env file')

r2_client = boto3.client('s3',
                         endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
                         aws_access_key_id=R2_ACCESS_KEY_ID,
                         aws_secret_access_key=R2_SECRET_ACCESS_KEY)

def list_all_r2_objects(prefix):
    all_objects = []
    
    try:
        paginator = r2_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=prefix):
            if 'Contents' in page:
                all_objects.extend(page['Contents'])
    except ClientError as e:
        logging.error(f"Error listing R2 objects: {e}")
    
    logging.info(f"Found {len(all_objects)} objects with prefix '{prefix}'")
    return all_objects

def update_r2_paths():
    try:
        logging.info('Fetching all records from websites_report_tracking')
        response = supabase.table('websites_report_tracking').select('id,json_path,html_path').execute()
        records = response.data

        if not records:
            logging.warning('No records found in websites_report_tracking')
            return

        logging.info(f"Found {len(records)} records to process")

        json_objects = list_all_r2_objects('lighthouse-reports/json/')
        html_objects = list_all_r2_objects('lighthouse-reports/html/')

        json_map = {obj['Key'].split('/')[-1].split('.report.json')[0]: obj['Key'] for obj in json_objects}
        html_map = {obj['Key'].split('/')[-1].split('.report.html')[0]: obj['Key'] for obj in html_objects}

        updated_count = 0
        not_found_count = 0

        for record in records:
            json_key = json_map.get(record['id'])
            html_key = html_map.get(record['id'])

            if json_key and html_key:
                json_path = f"https://{R2_BUCKET_NAME}.r2.cloudflarestorage.com/{json_key}"
                html_path = f"https://{R2_BUCKET_NAME}.r2.cloudflarestorage.com/{html_key}"

                if json_path != record['json_path'] or html_path != record['html_path']:
                    update_response = supabase.table('websites_report_tracking').update({
                        'json_path': json_path,
                        'html_path': html_path
                    }).eq('id', record['id']).execute()

                    if update_response.data:
                        updated_count += 1
                        logging.info(f"Updated record {record['id']}")
                    else:
                        logging.error(f"Error updating record {record['id']}: {update_response.error}")
            else:
                not_found_count += 1
                logging.warning(f"Could not find R2 objects for record {record['id']}")

        logging.info(f"Finished updating R2 paths. Updated: {updated_count}, Not found: {not_found_count}")
    except Exception as e:
        logging.error(f"Error in update_r2_paths: {e}")

def main():
    try:
        logging.info('Starting R2 path update process')
        update_r2_paths()
        logging.info('R2 path update process completed')
    except Exception as e:
        logging.error(f"Unhandled error in main function: {e}")

if __name__ == "__main__":
    main()
