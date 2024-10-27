import os
import pandas as pd
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

# R2 configuration
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME')
R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize R2 client
r2_client = boto3.client('s3',
                         endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
                         aws_access_key_id=R2_ACCESS_KEY_ID,
                         aws_secret_access_key=R2_SECRET_ACCESS_KEY)

def list_r2_files():
    """
    Fetch and list all files from Cloudflare R2 object storage.
    
    Returns:
    DataFrame with columns: key, size, last_modified, path
    """
    all_objects = []
    paginator = r2_client.get_paginator('list_objects_v2')
    
    try:
        for page in paginator.paginate(Bucket=R2_BUCKET_NAME):
            if 'Contents' in page:
                all_objects.extend(page['Contents'])
    except ClientError as e:
        print(f"Error listing R2 objects: {e}")
        return pd.DataFrame()
    
    if not all_objects:
        return pd.DataFrame()
    
    df = pd.DataFrame(all_objects)
    df['path'] = f"https://{R2_BUCKET_NAME}.r2.cloudflarestorage.com/" + df['Key']
    return df[['Key', 'Size', 'LastModified', 'path']]

def fetch_supabase_table(table_name):
    """
    Fetch a table from Supabase and return it as a DataFrame.
    
    Args:
    table_name (str): Name of the table to fetch
    
    Returns:
    DataFrame containing the table data
    """
    try:
        response = supabase.table(table_name).select("*").execute()
        return pd.DataFrame(response.data)
    except Exception as e:
        print(f"Error fetching Supabase table {table_name}: {e}")
        return pd.DataFrame()

# Example usage
if __name__ == "__main__":
    # List R2 files
    r2_files = list_r2_files()
    print("R2 Files:")
    print(r2_files.head())
    print(f"Total R2 files: {len(r2_files)}")
    
    # Fetch Supabase table
    supabase_table = fetch_supabase_table('websites_report_tracking')
    print("\nSupabase Table (websites_report_tracking):")
    print(supabase_table.head())
    print(f"Total records: {len(supabase_table)}")

