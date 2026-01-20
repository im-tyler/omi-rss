@echo off
REM Omi RSS Server Database Setup Script for Windows
REM This script sets up the PostgreSQL database for the Omi RSS Server

setlocal enabledelayedexpansion

REM Configuration
if "%DB_HOST%"=="" set DB_HOST=localhost
if "%DB_PORT%"=="" set DB_PORT=5432
if "%DB_NAME%"=="" set DB_NAME=omi_rss_dev
if "%DB_USER%"=="" set DB_USER=postgres
if "%DB_PASSWORD%"=="" set DB_PASSWORD=postgres

echo Omi RSS Server Database Setup
echo ================================

REM Check if PostgreSQL is accessible
echo Checking PostgreSQL connection...
set PGPASSWORD=%DB_PASSWORD%
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo FAILED: Cannot connect to PostgreSQL
    echo Please ensure PostgreSQL is running and accessible.
    exit /b 1
)
echo OK

REM Create database if it doesn't exist
echo Creating database '%DB_NAME%'...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -tc "SELECT 1 FROM pg_database WHERE datname = '%DB_NAME%'" | findstr /C:"1" >nul 2>&1
if %errorlevel% equ 0 (
    echo Database already exists
) else (
    createdb -h %DB_HOST% -p %DB_PORT% -U %DB_USER% %DB_NAME%
    if %errorlevel% neq 0 (
        echo FAILED: Could not create database
        exit /b 1
    )
    echo Database created
)

REM Change to script directory
cd /d "%~dp0"

REM Check if we're in the right directory
if not exist "pubspec.yaml" (
    echo Error: pubspec.yaml not found. Please run this script from the server directory.
    exit /b 1
)

REM Get dependencies
echo Getting Dart dependencies...
call dart pub get

REM Run Serverpod migrations
echo Setting up Serverpod auth tables...
call dart bin\main.dart --apply-migrations

REM Check if migrations directory exists
if not exist "migrations" (
    echo Error: migrations directory not found.
    exit /b 1
)

REM Create migrations tracking table if it doesn't exist
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "CREATE TABLE IF NOT EXISTS serverpod_migrations (module VARCHAR(128), version VARCHAR(128), timestamp TIMESTAMP, PRIMARY KEY (module, version))" >nul 2>&1

REM Run each migration file
echo Running Omi RSS migrations...
for %%f in (migrations\*.sql) do (
    set filename=%%~nxf
    echo Running !filename!...
    
    REM Check if migration was already applied
    psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -tc "SELECT 1 FROM serverpod_migrations WHERE module = 'omi_rss' AND version = '!filename!'" | findstr /C:"1" >nul 2>&1
    if !errorlevel! equ 0 (
        echo   Already applied
    ) else (
        REM Apply migration
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%%f" >nul 2>&1
        if !errorlevel! equ 0 (
            REM Record migration
            psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "INSERT INTO serverpod_migrations (module, version, timestamp) VALUES ('omi_rss', '!filename!', NOW())" >nul 2>&1
            echo   Applied successfully
        ) else (
            echo   FAILED
            echo Error applying migration !filename!
            exit /b 1
        )
    )
)

REM Create sample data if requested
if "%1"=="--with-sample-data" (
    echo Creating sample data...
    
    REM Create temporary SQL file
    echo -- Create a test user ^(assuming serverpod_user_info exists^) > temp_sample_data.sql
    echo INSERT INTO serverpod_user_info ^(userIdentifier, email, created, userName^) >> temp_sample_data.sql
    echo VALUES ^('test-user-1', 'test@example.com', NOW^(^), 'testuser'^) >> temp_sample_data.sql
    echo ON CONFLICT ^(email^) DO NOTHING; >> temp_sample_data.sql
    echo. >> temp_sample_data.sql
    echo -- Get the user ID and create sample data >> temp_sample_data.sql
    echo DO $$ >> temp_sample_data.sql
    echo DECLARE >> temp_sample_data.sql
    echo     test_user_id INTEGER; >> temp_sample_data.sql
    echo BEGIN >> temp_sample_data.sql
    echo     SELECT id INTO test_user_id FROM serverpod_user_info WHERE email = 'test@example.com'; >> temp_sample_data.sql
    echo     -- Create sample folders >> temp_sample_data.sql
    echo     INSERT INTO folders ^(name, description, user_id^) >> temp_sample_data.sql
    echo     VALUES >> temp_sample_data.sql
    echo         ^('Technology', 'Tech news and updates', test_user_id^), >> temp_sample_data.sql
    echo         ^('Business', 'Business and finance news', test_user_id^) >> temp_sample_data.sql
    echo     ON CONFLICT DO NOTHING; >> temp_sample_data.sql
    echo     -- Create sample feeds >> temp_sample_data.sql
    echo     INSERT INTO feeds ^(title, url, description, user_id, category^) >> temp_sample_data.sql
    echo     VALUES >> temp_sample_data.sql
    echo         ^('Hacker News', 'https://news.ycombinator.com/rss', 'Hacker News RSS feed', test_user_id, 'Technology'^), >> temp_sample_data.sql
    echo         ^('TechCrunch', 'https://techcrunch.com/feed/', 'TechCrunch news feed', test_user_id, 'Technology'^), >> temp_sample_data.sql
    echo         ^('BBC News', 'http://feeds.bbci.co.uk/news/rss.xml', 'BBC News feed', test_user_id, 'News'^) >> temp_sample_data.sql
    echo     ON CONFLICT DO NOTHING; >> temp_sample_data.sql
    echo END$$; >> temp_sample_data.sql
    
    psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f temp_sample_data.sql >nul 2>&1
    del temp_sample_data.sql
    
    echo Sample data created
)

echo.
echo Database setup complete!
echo Connection details:
echo   Host: %DB_HOST%
echo   Port: %DB_PORT%
echo   Database: %DB_NAME%
echo   User: %DB_USER%
echo.
echo To add sample data, run: %0 --with-sample-data

endlocal