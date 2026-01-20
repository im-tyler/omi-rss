#!/bin/bash

# Omi RSS Server Database Setup Script
# This script sets up the PostgreSQL database for the Omi RSS Server

set -e  # Exit on error

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-omi_rss_dev}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Omi RSS Server Database Setup${NC}"
echo "================================"

# Check if PostgreSQL is running
echo -n "Checking PostgreSQL connection... "
if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw postgres; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "Please ensure PostgreSQL is running and accessible."
    exit 1
fi

# Create database if it doesn't exist
echo -n "Creating database '$DB_NAME'... "
if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    echo -e "${YELLOW}Already exists${NC}"
else
    PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
    echo -e "${GREEN}Created${NC}"
fi

# Run Serverpod migrations first
echo -e "\n${YELLOW}Running Serverpod migrations...${NC}"
cd "$(dirname "$0")"

# Check if Serverpod is set up
if [ ! -f "pubspec.yaml" ]; then
    echo -e "${RED}Error: pubspec.yaml not found. Please run this script from the server directory.${NC}"
    exit 1
fi

# Get dependencies
echo "Getting Dart dependencies..."
dart pub get

# Run Serverpod create-migration to ensure auth tables exist
echo "Setting up Serverpod auth tables..."
dart bin/main.dart --apply-migrations

# Run our custom migrations
echo -e "\n${YELLOW}Running Omi RSS migrations...${NC}"

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
    echo -e "${RED}Error: migrations directory not found.${NC}"
    exit 1
fi

# Run each migration file
for migration in migrations/*.sql; do
    if [ -f "$migration" ]; then
        filename=$(basename "$migration")
        echo -n "Running $filename... "
        
        # Check if migration was already applied
        if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc "SELECT 1 FROM serverpod_migrations WHERE module = 'omi_rss' AND version = '$filename'" 2>/dev/null | grep -q 1; then
            echo -e "${YELLOW}Already applied${NC}"
        else
            # Apply migration
            if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration" > /dev/null 2>&1; then
                # Record migration
                PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "INSERT INTO serverpod_migrations (module, version, timestamp) VALUES ('omi_rss', '$filename', NOW())" > /dev/null 2>&1
                echo -e "${GREEN}Applied${NC}"
            else
                echo -e "${RED}FAILED${NC}"
                echo "Error applying migration $filename"
                exit 1
            fi
        fi
    fi
done

# Create sample data for development
if [ "$1" == "--with-sample-data" ]; then
    echo -e "\n${YELLOW}Creating sample data...${NC}"
    
    cat << EOF | PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > /dev/null 2>&1
-- Create a test user (assuming serverpod_user_info exists)
INSERT INTO serverpod_user_info (userIdentifier, email, created, userName)
VALUES ('test-user-1', 'test@example.com', NOW(), 'testuser')
ON CONFLICT (email) DO NOTHING;

-- Get the user ID
DO \$\$
DECLARE
    test_user_id INTEGER;
BEGIN
    SELECT id INTO test_user_id FROM serverpod_user_info WHERE email = 'test@example.com';
    
    -- Create sample folders
    INSERT INTO folders (name, description, user_id)
    VALUES 
        ('Technology', 'Tech news and updates', test_user_id),
        ('Business', 'Business and finance news', test_user_id)
    ON CONFLICT DO NOTHING;
    
    -- Create sample feeds
    INSERT INTO feeds (title, url, description, user_id, category)
    VALUES 
        ('Hacker News', 'https://news.ycombinator.com/rss', 'Hacker News RSS feed', test_user_id, 'Technology'),
        ('TechCrunch', 'https://techcrunch.com/feed/', 'TechCrunch news feed', test_user_id, 'Technology'),
        ('BBC News', 'http://feeds.bbci.co.uk/news/rss.xml', 'BBC News feed', test_user_id, 'News')
    ON CONFLICT DO NOTHING;
END\$\$;
EOF
    
    echo -e "${GREEN}Sample data created${NC}"
fi

echo -e "\n${GREEN}Database setup complete!${NC}"
echo "Connection details:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""
echo "To add sample data, run: $0 --with-sample-data"