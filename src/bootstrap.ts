import { loadConfig, validateConfig } from './config/Configuration.js';
import { Logger } from './infrastructure/logging/Logger.js';
import { InMemoryCache } from './infrastructure/cache/InMemoryCache.js';
import { ShopwareAuthenticator } from './infrastructure/shopware/ShopwareAuthenticator.js';
import { ShopwareApiClient } from './infrastructure/shopware/ShopwareApiClient.js';
import { WikiJsService } from './infrastructure/wikijs/WikiJsService.js';
import { ProductService } from './core/services/ProductService.js';
import { CategoryService } from './core/services/CategoryService.js';
import { ContentService } from './core/services/ContentService.js';
import { SnippetService } from './core/services/SnippetService.js';
import { ManufacturerService } from './core/services/ManufacturerService.js';
import { PropertyService } from './core/services/PropertyService.js';
import { MailTemplateService } from './core/services/MailTemplateService.js';
import { FlowService } from './core/services/FlowService.js';
import { MediaService } from './core/services/MediaService.js';
import { OrderService } from './core/services/OrderService.js';
import { CrossSellingService } from './core/services/CrossSellingService.js';
import { SeoUrlService } from './core/services/SeoUrlService.js';
import type { ServiceContainer } from './tools/handlers/types.js';

export interface BootstrapResult {
  config: ReturnType<typeof loadConfig>;
  logger: Logger;
  services: ServiceContainer;
  // Exposed separately so index.ts can call destroy() on shutdown
  mailTemplateService: MailTemplateService;
}

export function bootstrap(): BootstrapResult {
  const config = loadConfig();
  validateConfig(config);

  const logger = new Logger(config.logLevel);
  const cache = new InMemoryCache(logger);

  const authenticator = new ShopwareAuthenticator(
    config.shopware.url,
    config.shopware.clientId,
    config.shopware.clientSecret,
    logger
  );
  const shopwareApi = new ShopwareApiClient(config.shopware.url, authenticator, logger);

  const wikiService = new WikiJsService(config.wikijs.baseUrl, cache, logger);

  const productService = new ProductService(shopwareApi, cache, logger, {
    defaultTaxId: config.shopware.defaultTaxId,
    defaultTaxRate: config.shopware.defaultTaxRate,
    defaultCurrencyId: config.shopware.defaultCurrencyId,
    defaultSalesChannelId: config.shopware.defaultSalesChannelId,
  });
  const categoryService = new CategoryService(shopwareApi, cache, logger);
  const snippetService = new SnippetService(shopwareApi, cache, logger);
  const manufacturerService = new ManufacturerService(shopwareApi, cache, logger);
  const propertyService = new PropertyService(shopwareApi, cache, logger);
  const contentService = new ContentService(
    productService,
    categoryService,
    snippetService,
    wikiService,
    logger
  );
  const mailTemplateService = new MailTemplateService(
    shopwareApi,
    cache,
    logger,
    config.shopware.defaultSalesChannelId
  );
  const flowService = new FlowService(shopwareApi, cache, logger);
  const mediaService = new MediaService(shopwareApi, cache, logger);
  const orderService = new OrderService(shopwareApi, cache, logger);
  const crossSellingService = new CrossSellingService(shopwareApi, cache, logger);
  const seoUrlService = new SeoUrlService(shopwareApi, cache, logger);

  const services: ServiceContainer = {
    product: productService,
    category: categoryService,
    content: contentService,
    snippet: snippetService,
    manufacturer: manufacturerService,
    property: propertyService,
    mailTemplate: mailTemplateService,
    flow: flowService,
    media: mediaService,
    order: orderService,
    crossSelling: crossSellingService,
    seoUrl: seoUrlService,
  };

  return { config, logger, services, mailTemplateService };
}
