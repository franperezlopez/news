import sys
from jinja2 import Environment, FileSystemLoader
import os
from datetime import datetime
import inflect
from pathlib import Path

# Create an inflect engine
p = inflect.engine()

def create_ml_news_data(date: datetime) -> tuple[str, str]:
    year = date.year
    week_number = date.isocalendar()[1]  # Get the ISO week number
    week_with_suffix = p.ordinal(week_number)  # Get ordinal representation (e.g., "1st", "2nd")

    return f"ML NEWS / {year} / {week_with_suffix} week", f"index_{year}_{week_number:02d}.html"

def parse_date_argument() -> datetime:
    """Parses the command-line argument for the date or defaults to today."""
    if len(sys.argv) > 1:
        try:
            return datetime.strptime(sys.argv[1], "%d/%m/%Y")
        except ValueError:
            print("Error: Date must be in the format dd/mm/yyyy.")
            sys.exit(1)
    return datetime.today()

# Parse the date argument
date = parse_date_argument()

# Set up Jinja2 environment to load templates from a directory
template_dir = Path(os.path.dirname(__file__)).parent / 'templates'
env = Environment(loader=FileSystemLoader(template_dir))

# Load the template file
template = env.get_template('index_weekly.j2')

# Define the data to be used in the template
title, filename = create_ml_news_data(date)
data = {
    'title': title,
}

# Render the template with data
rendered_html = template.render(data)

# Save the rendered HTML to an output file
output_file = Path(os.path.dirname(__file__)).parent / filename
if not output_file.exists():
    with open(output_file, 'w') as f:
        f.write(rendered_html)
    print(f"HTML file {output_file} generated")
else:
    print(f"HTML file {output_file} already exists")

