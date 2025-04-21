# Amazon Reviews Data Processing Pipeline

## 📌 Overview
This project processes Amazon product reviews using **Apache Spark** in **Google Colab**. It includes **real-time streaming, exploratory data analysis (EDA), NLP analysis, anomaly detection, and an interactive dashboard** for insights.

---

## 🚀 Steps to Run the Pipeline

### 1️⃣ Set Up Google Colab & Spark
1. Open **Google Colab**.
2. Run the following commands to install Spark:
   ```python
   !apt-get install openjdk-11-jdk-headless -qq > /dev/null
   !wget -qO - https://archive.apache.org/dist/spark/spark-3.3.2/spark-3.3.2-bin-hadoop3.tgz | tar xz
   !pip install findspark pyspark dash plotly wordcloud
   ```

### 2️⃣ Start the Spark Streaming Pipeline
1. Run the provided Python script.
2. The script will:
   - Stream and preprocess data in real time.
   - Handle missing values and remove duplicates.
   - Detect anomalies in review ratings using **Spark MLlib**.
   - Store processed data in `/content/processed_output/`.

3. **Simulate Streaming:**
   - Upload JSON review files to `/content/streaming_input/`.
   - The pipeline will automatically process new files.

### 3️⃣ Run EDA & NLP Analysis
1. Perform query-based **exploratory data analysis (EDA)**:
   - Top reviewed products, sentiment trends, review patterns, etc.
   - Correlation heatmaps and business insights.
2. Generate **word clouds** and run **sentiment classification**.
3. Detect **topic modeling** insights using **LDA (Latent Dirichlet Allocation)**.

### 4️⃣ Interactive Dashboard
1. Run the **Dash-based interactive dashboard**:
   ```python
   python dashboard.py
   ```
2. The dashboard includes:
   - Top-rated products
   - Review distribution
   - Sentiment analysis
   - Anomaly detection

### 5️⃣ Optimizations & Bonus Features
✅ **Performance Improvements:**
   - **Caching and partitioning** for faster Spark queries.
✅ **Bonus Dataset Analysis:**
   - User behavioral data (clicks, add-to-cart, purchases).
   - Insights on purchasing patterns and product engagement.

---

## ⚠️ Challenges & Assumptions
✅ **Challenges:**
- Efficient real-time streaming in a **resource-limited Colab environment**.
- **Handling large datasets** while maintaining interactivity.

✅ **Assumptions:**
- Data follows a **structured JSON format**.
- Only **valid product reviews** are considered.
- The dataset **fits within Colab’s memory limits**.

---

## 📂 Folder Structure
```
📦 Amazon Reviews Pipeline
├── i210851_i212460_DV_Pipeline.ipynb
├── processed_output/                     # Cleaned & transformed data
├── logs/                                 # Logging & error tracking
├── README.md                             # Documentation
```

---

That’s it! If you face issues, check **logs/** for debugging.