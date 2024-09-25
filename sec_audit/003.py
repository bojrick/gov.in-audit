import json
import subprocess
import os
from datetime import datetime
import shutil
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

def load_websites(json_file):
    try:
        with open(json_file, 'r') as f:
            websites = json.load(f)
        logging.info(f"Loaded {len(websites)} websites from {json_file}")
        return websites
    except FileNotFoundError:
        logging.error(f"File {json_file} not found")
        return []
    except json.JSONDecodeError:
        logging.error(f"Invalid JSON in {json_file}")
        return []

def generate_lighthouse_report(url, output_dir):
    filename = f"{url.replace('https://', '').replace('http://', '').replace('/', '_')}.json"
    output_path = os.path.join(output_dir, filename)
    
    lighthouse_path = shutil.which('lighthouse')
    if not lighthouse_path:
        logging.error("Lighthouse executable not found. Make sure it's installed and in your PATH.")
        return None
    
    command = [
        lighthouse_path,
        url,
        "--output=json",
        f"--output-path={output_path}",
        "--chrome-flags=--headless"
    ]
    
    try:
        logging.debug(f"Running command: {' '.join(command)}")
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logging.info(f"Lighthouse report generated for {url}")
        return output_path
    except subprocess.CalledProcessError as e:
        logging.error(f"Error running Lighthouse for {url}: {e}")
        logging.debug(f"Stdout: {e.stdout}")
        logging.debug(f"Stderr: {e.stderr}")
        return None

def analyze_lighthouse_report(report_path):
    try:
        with open(report_path, 'r') as f:
            data = json.load(f)
        
        performance_score = data['categories']['performance']['score']
        fcp = data['audits']['first-contentful-paint']['numericValue']
        lcp = data['audits']['largest-contentful-paint']['numericValue']
        tti = data['audits']['interactive']['numericValue']
        cls = data['audits']['cumulative-layout-shift']['numericValue']
        
        logging.info(f"Analysis complete for {report_path}")
        return {
            'performance_score': performance_score,
            'first_contentful_paint': fcp,
            'largest_contentful_paint': lcp,
            'time_to_interactive': tti,
            'cumulative_layout_shift': cls
        }
    except FileNotFoundError:
        logging.error(f"Report file not found: {report_path}")
        return None
    except json.JSONDecodeError:
        logging.error(f"Invalid JSON in report: {report_path}")
        return None
    except KeyError as e:
        logging.error(f"Missing expected data in report {report_path}: {e}")
        return None

def main():
    websites = load_websites('valid_urls.json')
    if not websites:
        logging.error("No websites loaded. Exiting.")
        return

    output_dir = f"lighthouse_reports_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(output_dir, exist_ok=True)
    
    results = []
    
    for website in websites:
        logging.info(f"Analyzing {website}...")
        report_path = generate_lighthouse_report(website, output_dir)
        if report_path:
            metrics = analyze_lighthouse_report(report_path)
            if metrics:
                results.append({
                    'url': website,
                    'metrics': metrics
                })
            else:
                logging.warning(f"No metrics obtained for {website}")
        else:
            logging.warning(f"Skipping analysis for {website} due to Lighthouse error.")
    
    # Save results
    with open('analysis_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    logging.info(f"Analysis complete. Results saved in 'analysis_results.json'. Total websites analyzed: {len(results)}")

if __name__ == "__main__":
    main()