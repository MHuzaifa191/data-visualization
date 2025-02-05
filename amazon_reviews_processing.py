import logging
import os
from datetime import datetime
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType

# Create logs directory
os.makedirs('logs', exist_ok=True)

# Configure file and console logging
log_file = 'logs/amazon_reviews_processing.log'
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

def log_system_info():
    logger.info("System Information:")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Available CPU count: {os.cpu_count()}")
    logger.info(f"Current working directory: {os.getcwd()}")
    !nvidia-smi > logs/gpu_info.txt 2>&1 || echo "No GPU found"
    logger.info("GPU information saved to logs/gpu_info.txt")

def create_spark_session():
    logger.info("Creating Spark session...")
    spark = SparkSession.builder \
        .appName("AmazonReviewsLoader") \
        .config("spark.driver.memory", "12g") \
        .config("spark.executor.memory", "12g") \
        .config("spark.sql.shuffle.partitions", "100") \
        .config("spark.eventLog.enabled", "true") \
        .config("spark.eventLog.dir", "logs/spark_events") \
        .getOrCreate()
    
    logger.info(f"Spark session created with configurations:")
    for key in spark.conf.get("spark.*").keys():
        logger.debug(f"  {key}: {spark.conf.get(key)}")
    return spark

def log_dataframe_info(df, name="DataFrame"):
    logger.info(f"\n{name} Information:")
    logger.info(f"Schema:\n{df._jdf.schema().treeString()}")
    logger.info(f"Number of partitions: {df.rdd.getNumPartitions()}")
    logger.info("Storage level: %s", df.storageLevel)

def process_data():
    try:
        logger.info("Starting data processing pipeline")
        start_time = datetime.now()
        
        # Create Spark session
        spark = create_spark_session()
        
        # Log system information
        log_system_info()
        
        # Define schema
        logger.info("Defining schema...")
        schema = StructType([
            StructField("reviewerID", StringType(), True),
            StructField("asin", StringType(), True),
            StructField("reviewerName", StringType(), True),
            StructField("helpful", StringType(), True),
            StructField("reviewText", StringType(), True),
            StructField("overall", DoubleType(), True),
            StructField("summary", StringType(), True),
            StructField("unixReviewTime", LongType(), True),
            StructField("reviewTime", StringType(), True)
        ])
        
        # Check input file
        file_path = "All_Amazon_Review.json.gz"
        file_size = os.path.getsize(file_path) / (1024*1024*1024)
        logger.info(f"Input file size: {file_size:.2f} GB")
        
        # Load data
        logger.info("Loading JSON data...")
        df = spark.read.json(
            file_path,
            schema=schema,
            mode="PERMISSIVE"
        )
        
        # Log DataFrame info
        log_dataframe_info(df, "Initial DataFrame")
        
        # Take sample
        logger.info("Taking sample...")
        sample_df = df.limit(2)
        sample_df.show(truncate=False)
        
        # Cache DataFrame
        logger.info("Caching DataFrame...")
        df.cache()
        
        # Get approximate count
        logger.info("Getting approximate count...")
        approx_count = df.rdd.countApprox(timeout=60)
        logger.info(f"Approximate record count: {approx_count}")
        
        # Save as parquet
        logger.info("Saving to parquet format...")
        parquet_path = "amazon_reviews.parquet"
        save_start = datetime.now()
        df.write.mode("overwrite").parquet(parquet_path)
        save_end = datetime.now()
        logger.info(f"Parquet save completed in {save_end - save_start}")
        
        # Log parquet file info
        logger.info(f"Parquet directory size: {sum(os.path.getsize(os.path.join(parquet_path, f)) for f in os.listdir(parquet_path))/1024/1024/1024:.2f} GB")
        
        # Memory stats
        logger.info("Memory statistics:")
        logger.info(f"Storage memory used: {spark.sparkContext._jvm.org.apache.spark.storage.StorageUtils.storageMemoryUsed()}")
        
        end_time = datetime.now()
        logger.info(f"Total processing time: {end_time - start_time}")
        
    except Exception as e:
        logger.error("Error during processing", exc_info=True)
        raise
    finally:
        logger.info("Stopping Spark session")
        spark.stop()

if __name__ == "__main__":
    logger.info("=== Starting Amazon Reviews Processing ===")
    process_data()
    logger.info("=== Processing Complete ===")
