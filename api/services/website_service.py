import json
from typing import Any

from flask_login import current_user
from werkzeug.exceptions import NotFound

from core.helper import encrypter
from core.rag.extractor.firecrawl.firecrawl_app import FirecrawlApp
from extensions.ext_database import db
from models.source import DataSourceApiKeyAuthBinding
from services.auth.api_key_auth_service import ApiKeyAuthService


class WebsiteService:

    @classmethod
    def document_create_args_validate(cls, args: dict):
        if 'url' not in args or not args['url']:
            raise ValueError('url is required')
        if 'options' not in args or not args['options']:
            raise ValueError('options is required')
        if 'limit' not in args['options'] or not args['options']['limit']:
            raise ValueError('limit is required')

    @classmethod
    def crawl_url(cls, args: dict) -> dict:
        provider = args.get('provider')
        url = args.get('url')
        options = args.get('options')
        credentials = ApiKeyAuthService.get_auth_credentials(current_user.current_tenant_id,
                                                             'website',
                                                             provider)
        if provider == 'firecrawl':
            # decrypt api_key
            api_key = encrypter.decrypt_token(
                tenant_id=current_user.current_tenant_id,
                token=credentials.get('config').get('api_key')
            )
            firecrawl_app = FirecrawlApp(api_key=api_key,
                                         base_url=credentials.get('config').get('base_url', None))
            crawl_sub_pages = options.get('crawl_sub_pages', False)
            only_main_content = options.get('only_main_content', False)
            if not crawl_sub_pages:
                params = {
                    'crawlerOptions': {
                        "includes": [],
                        "excludes": [],
                        "generateImgAltText": True,
                        "maxDepth": 1,
                        "limit": 1,
                        'returnOnlyUrls': False,
                        'pageOptions': {
                            'onlyMainContent': only_main_content,
                            "includeHtml": False
                        }
                    }
                }
            else:
                includes = ','.join(options.get('includes')) if options.get('includes') else []
                excludes = ','.join(options.get('excludes')) if options.get('excludes') else []
                params = {
                    'crawlerOptions': {
                        "includes": includes if includes else [],
                        "excludes": excludes if excludes else [],
                        "generateImgAltText": True,
                        "maxDepth": options.get('max_depth', 1),
                        "limit": options.get('limit', 1),
                        'returnOnlyUrls': False,
                        'pageOptions': {
                            'onlyMainContent': only_main_content,
                            "includeHtml": False
                        }
                    }
                }
            job_id = firecrawl_app.crawl_url(url, params)
            return {
                'status': 'active',
                'job_id': job_id
            }
        else:
            raise ValueError('Invalid provider')

    @classmethod
    def get_crawl_status(cls, job_id: str, provider: str) -> dict:
        credentials = ApiKeyAuthService.get_auth_credentials(current_user.current_tenant_id,
                                                             'website',
                                                             provider)
        if provider == 'firecrawl':
            # decrypt api_key
            api_key = encrypter.decrypt_token(
                tenant_id=current_user.current_tenant_id,
                token=credentials.get('config').get('api_key')
            )
            firecrawl_app = FirecrawlApp(api_key=api_key,
                                         base_url=credentials.get('config').get('base_url', None))
            result = firecrawl_app.check_crawl_status(job_id)
            crawl_status_data = {
                'status': result.get('status', 'active'),
                'job_id': job_id,
                'total': result.get('total', 0),
                'current': result.get('current', 0),
                'data': result.get('data', [])
            }
        else:
            raise ValueError('Invalid provider')
        return crawl_status_data

    @classmethod
    def get_crawl_url_data(cls, job_id: str, provider: str, url: str) -> dict | None:
        credentials = ApiKeyAuthService.get_auth_credentials(current_user.current_tenant_id,
                                                             'website',
                                                             provider)
        if provider == 'firecrawl':
            # decrypt api_key
            api_key = encrypter.decrypt_token(
                tenant_id=current_user.current_tenant_id,
                token=credentials.get('config').get('api_key')
            )
            firecrawl_app = FirecrawlApp(api_key=api_key,
                                         base_url=credentials.get('config').get('base_url', None))
            result = firecrawl_app.check_crawl_status(job_id)
            if result.get('status') != 'completed':
                raise ValueError('Crawl job is not completed')
            data = result.get('data')
            if data:
                for item in data:
                    if item.get('data').get('source_url') == url:
                        return item
            return None
        else:
            raise ValueError('Invalid provider')

    @classmethod
    def get_scrape_url_data(cls, provider: str, url: str, only_main_content: bool) -> dict | None:
        credentials = ApiKeyAuthService.get_auth_credentials(current_user.current_tenant_id,
                                                             'website',
                                                             provider)
        if provider == 'firecrawl':
            # decrypt api_key
            api_key = encrypter.decrypt_token(
                tenant_id=current_user.current_tenant_id,
                token=credentials.get('config').get('api_key')
            )
            firecrawl_app = FirecrawlApp(api_key=api_key,
                                         base_url=credentials.get('config').get('base_url', None))
            params = {
                'pageOptions': {
                    'onlyMainContent': only_main_content,
                    "includeHtml": False
                }
            }
            result = firecrawl_app.scrape_url(url, params)
            return result
        else:
            raise ValueError('Invalid provider')