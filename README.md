# Amazon Reviews Data Loading Assignment

## Purpose
This assignment focuses on developing a robust, scalable data loading mechanism using Apache Spark to handle the large Amazon Review dataset. The main objectives are:
- Efficient loading and processing of large-scale data (80GB+ uncompressed)
- Implementation of proper schema inference and memory management
- Comprehensive error handling and logging
- Creating a maintainable and well-documented codebase

## Setup and Running Instructions

### Prerequisites
- Google Colab account (free tier sufficient)
- Approximately 100GB of available storage (80GB for dataset, 20GB for processing)
- Python 3.x
- PySpark

### Environment Setup
1. Open Google Colab
2. Create a new notebook
3. Clone the repository:
```bash
!git clone https://github.com/MHuzaifa191/spark-data.git
```

### Dataset Setup
1. Download the Amazon Review dataset:
```python
!wget --no-check-certificate https://jmcauley.ucsd.edu/data/amazon_v2/categoryFiles/All_Amazon_Review.json.gz
```

### Running the Code
1. Execute the installation cells:
```python
!apt-get update
!apt-get install openjdk-8-jdk-headless -qq > /dev/null
!pip install pyspark
```

2. Run the main processing script:
```python
python amazon_reviews_processing.py
```

3. Monitor progress in logs:
```python
!tail -f logs/amazon_reviews_processing.log
```

## Project Structure
```
├── src/
│   └── amazon_reviews_processing.py
├── logs/
│   └── amazon_reviews_processing.log
└── README.md
```

## Assumptions & Constraints
1. **Memory Requirements**:
   - Assumes availability of at least 12GB RAM in Colab
   - Uses memory-efficient processing techniques

2. **Storage Requirements**:
   - Dataset: ~80GB uncompressed
   - Processing space: ~20GB
   - Total required: ~100GB

3. **Processing Time**:
   - Download: 30-60 minutes
   - Initial processing: 15-30 minutes
   - Full analysis: 1-2 hours

## Challenges Encountered

### 1. Memory Management
- **Challenge**: Processing 80GB+ of data in limited Colab environment
- **Solution**: 
  - Implemented chunked processing
  - Used parquet format for efficient storage
  - Configured appropriate Spark memory settings

### 2. Session Timeouts
- **Challenge**: Colab disconnections during long processing
- **Solution**:
  - Added comprehensive logging
  - Implemented checkpointing
  - Created resumable processing pipeline

### 3. Performance Optimization
- **Challenge**: Slow processing of JSON data
- **Solution**:
  - Used explicit schema definition
  - Implemented proper partitioning
  - Converted to parquet for faster subsequent processing

## Performance Metrics
- Initial JSON load: ~30 minutes
- Parquet conversion: ~15 minutes
- Full data analysis: ~1 hour
- Memory usage: 10-12GB peak

## Logging and Monitoring
- Detailed logs available in `logs/amazon_reviews_processing.log`
- Includes:
  - Processing times
  - Memory usage
  - Error tracking
  - System statistics
