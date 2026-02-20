import type { ProductService } from '../../core/services/ProductService.js';
import type { CategoryService } from '../../core/services/CategoryService.js';
import type { ContentService } from '../../core/services/ContentService.js';
import type { SnippetService } from '../../core/services/SnippetService.js';
import type { ManufacturerService } from '../../core/services/ManufacturerService.js';
import type { PropertyService } from '../../core/services/PropertyService.js';
import type { MailTemplateService } from '../../core/services/MailTemplateService.js';
import type { FlowService } from '../../core/services/FlowService.js';
import type { MediaService } from '../../core/services/MediaService.js';
import type { OrderService } from '../../core/services/OrderService.js';
import type { CrossSellingService } from '../../core/services/CrossSellingService.js';
import type { SeoUrlService } from '../../core/services/SeoUrlService.js';

export interface ServiceContainer {
  product: ProductService;
  category: CategoryService;
  content: ContentService;
  snippet: SnippetService;
  manufacturer: ManufacturerService;
  property: PropertyService;
  mailTemplate: MailTemplateService;
  flow: FlowService;
  media: MediaService;
  order: OrderService;
  crossSelling: CrossSellingService;
  seoUrl: SeoUrlService;
}

export type ToolResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (args: unknown) => Promise<ToolResponse>;
