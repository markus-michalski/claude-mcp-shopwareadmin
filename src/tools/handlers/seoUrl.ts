import {
  SeoUrlListInput,
  SeoUrlAuditInput,
  SeoUrlUpdateInput,
  SeoUrlGenerateInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function seoUrlHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    seo_url_list: async (args) => {
      const input = SeoUrlListInput.parse(args);
      const result = await services.seoUrl.list(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: result.urls.length,
            total: result.total,
            urls: result.urls,
          }, null, 2),
        }],
      };
    },

    seo_url_audit: async (args) => {
      const input = SeoUrlAuditInput.parse(args);
      const result = await services.seoUrl.audit(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            audit: 'SEO URL Health Check',
            totalUrlsChecked: result.totalUrlsChecked,
            issueCount: result.issueCount,
            issuesByType: result.issuesByType,
            issues: result.issues,
            recommendation: result.issueCount > 0
              ? `${result.issueCount} issue(s) found. Use seo_url_update to fix individual URLs or seo_url_generate to regenerate.`
              : 'No issues found. SEO URLs are healthy!',
          }, null, 2),
        }],
      };
    },

    seo_url_update: async (args) => {
      const input = SeoUrlUpdateInput.parse(args);
      const { id, ...updateData } = input;
      const seoUrl = await services.seoUrl.update(id, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'SEO URL updated',
            seoUrl: {
              id: seoUrl.id,
              seoPathInfo: seoUrl.seoPathInfo,
              isCanonical: seoUrl.isCanonical,
              isModified: seoUrl.isModified,
              isDeleted: seoUrl.isDeleted,
            },
            updated: Object.keys(updateData),
          }, null, 2),
        }],
      };
    },

    seo_url_generate: async (args) => {
      const input = SeoUrlGenerateInput.parse(args);
      const result = await services.seoUrl.generate(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: result.message,
            routeName: input.routeName,
            salesChannelId: input.salesChannelId,
          }, null, 2),
        }],
      };
    },
  };
}
