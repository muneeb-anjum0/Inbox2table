"""
Test Suite for Timetable Scraper Backend
"""
import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Import your app
import sys
import os
# Add the backend directory to Python path (parent of tests)
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app import app, get_user_from_request

@pytest.fixture
def client():
    """Test client"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@pytest.fixture
def mock_user():
    """Mock user data"""
    return {
        'id': 'test-user-id',
        'email': 'test@example.com',
        'created_at': datetime.now().isoformat()
    }

@pytest.fixture
def mock_supabase():
    """Mock Supabase manager"""
    with patch('app.supabase_manager') as mock:
        yield mock

class TestHealthEndpoint:
    """Test health check endpoint"""
    
    def test_health_check_success(self, client):
        """Test successful health check"""
        response = client.get('/api/health')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
        assert 'timestamp' in data

class TestAuthentication:
    """Test authentication functionality"""
    
    def test_get_user_from_request_valid_header(self, mock_supabase, mock_user):
        """Test user extraction from header"""
        mock_supabase.get_or_create_user.return_value = mock_user
        
        with app.test_request_context('/', headers={'X-User-Email': 'test@example.com'}):
            user, error, status = get_user_from_request()
            
            assert user == mock_user
            assert error is None
            assert status is None

    def test_get_user_from_request_no_email(self):
        """Test user extraction without email"""
        with app.test_request_context('/'):
            user, error, status = get_user_from_request()
            
            assert user is None
            assert status == 400

    def test_get_user_from_request_invalid_email(self):
        """Test user extraction with invalid email"""
        with app.test_request_context('/', headers={'X-User-Email': 'invalid-email'}):
            user, error, status = get_user_from_request()
            
            # Current behavior is permissive and delegates validation/storage to Supabase.
            assert user is not None
            assert error is None
            assert status is None

class TestSemesterConfiguration:
    """Test semester configuration endpoints"""
    
    def test_update_semesters_success(self, client, mock_supabase, mock_user):
        """Test successful semester update"""
        mock_supabase.get_or_create_user.return_value = mock_user
        mock_supabase.get_user_settings.return_value = {'allowed_semesters': []}
        mock_supabase.save_user_settings.return_value = True
        
        response = client.post('/api/config/semesters',
                             json={'semesters': ['BS (SE) - 5C']},
                             headers={'X-User-Email': 'test@example.com'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True

    def test_update_semesters_invalid_data(self, client, mock_supabase, mock_user):
        """Test semester update with invalid data"""
        mock_supabase.get_or_create_user.return_value = mock_user
        
        response = client.post('/api/config/semesters',
                             json={'invalid': 'data'},
                             headers={'X-User-Email': 'test@example.com'})
        
        assert response.status_code == 400

    def test_update_semesters_no_auth(self, client):
        """Test semester update without authentication"""
        response = client.post('/api/config/semesters',
                             json={'semesters': ['BS (SE) - 5C']})
        
        assert response.status_code == 400

class TestScrapeEndpoint:
    """Test scraping functionality"""
    
    @patch('app.run_once')
    def test_scrape_success(self, mock_run_once, client, mock_supabase, mock_user):
        """Test successful scrape"""
        mock_supabase.get_or_create_user.return_value = mock_user
        mock_supabase.get_user_settings.return_value = {'allowed_semesters': ['BS (SE) - 5C']}
        mock_run_once.return_value = {
            'success': True,
            'data': [{'course': 'Test Course'}]
        }
        
        response = client.post('/api/scrape',
                             headers={'X-User-Email': 'test@example.com'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True

    @patch('app.run_once')
    def test_scrape_failure(self, mock_run_once, client, mock_supabase, mock_user):
        """Test scrape failure"""
        mock_supabase.get_or_create_user.return_value = mock_user
        mock_supabase.get_user_settings.return_value = {'allowed_semesters': ['BS (SE) - 5C']}
        mock_run_once.return_value = {
            'success': False,
            'error': 'Test error'
        }
        
        response = client.post('/api/scrape',
                             headers={'X-User-Email': 'test@example.com'})
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False

class TestErrorHandling:
    """Test error handling"""
    
    def test_404_error(self, client):
        """Test 404 error handling"""
        response = client.get('/api/nonexistent')
        assert response.status_code == 404

        # App currently uses Flask's default 404 HTML response.
        assert b'Not Found' in response.data

    def test_405_error(self, client):
        """Test 405 error handling"""
        response = client.delete('/api/health')  # DELETE not allowed
        assert response.status_code == 405

if __name__ == '__main__':
    pytest.main([__file__, '-v'])