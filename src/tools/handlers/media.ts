import {
  MediaListInput,
  MediaGetInput,
  MediaUpdateInput,
  MediaSearchInput,
  MediaAuditAltInput,
  MediaUploadUrlInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function mediaHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    media_list: async (args) => {
      const input = MediaListInput.parse(args);
      const result = await services.media.list(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: result.media.length,
            total: result.total,
            media: result.media,
          }, null, 2),
        }],
      };
    },

    media_get: async (args) => {
      const input = MediaGetInput.parse(args);
      const media = await services.media.get(input);
      if (!media) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Media not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(media, null, 2) }],
      };
    },

    media_update: async (args) => {
      const input = MediaUpdateInput.parse(args);
      const { id, ...updateData } = input;
      const media = await services.media.update(id, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Media updated',
            media: {
              id: media.id,
              fileName: media.fileName,
              alt: media.alt,
              title: media.title,
            },
            updated: Object.keys(updateData),
          }, null, 2),
        }],
      };
    },

    media_search: async (args) => {
      const input = MediaSearchInput.parse(args);
      const results = await services.media.search(input.query, input.limit ?? 20);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: input.query,
            count: results.length,
            media: results,
          }, null, 2),
        }],
      };
    },

    media_audit_alt: async (args) => {
      const input = MediaAuditAltInput.parse(args);
      const result = await services.media.auditAlt(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            audit: 'BFSG Alt-Text Compliance',
            totalMediaChecked: result.totalMediaChecked,
            missingAltCount: result.missingAltCount,
            affectedProductCount: result.affectedProductCount,
            items: result.items,
            recommendation: result.missingAltCount > 0
              ? `${result.missingAltCount} media items are missing alt text. Use media_update to add alt text for BFSG compliance.`
              : 'All product media have alt text. BFSG compliant!',
          }, null, 2),
        }],
      };
    },

    media_upload_url: async (args) => {
      const input = MediaUploadUrlInput.parse(args);
      const result = await services.media.uploadFromUrl(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: 'Media uploaded from URL',
            media: {
              id: result.mediaId,
              fileName: result.fileName,
              url: result.url,
            },
          }, null, 2),
        }],
      };
    },
  };
}
