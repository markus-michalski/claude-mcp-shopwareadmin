import {
  MailTemplateListInput,
  MailTemplateGetInput,
  MailTemplateUpdateInput,
  MailTemplateSendTestInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function mailTemplateHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    mail_template_list: async (args) => {
      const input = MailTemplateListInput.parse(args);
      const result = await services.mailTemplate.list(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: result.templates.length,
            total: result.total,
            templates: result.templates,
          }, null, 2),
        }],
      };
    },

    mail_template_get: async (args) => {
      const input = MailTemplateGetInput.parse(args);
      const template = await services.mailTemplate.get(input);
      if (!template) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Mail template not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(template, null, 2) }],
      };
    },

    mail_template_update: async (args) => {
      const input = MailTemplateUpdateInput.parse(args);
      const { id, ...updateData } = input;
      const template = await services.mailTemplate.update(id, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Mail template updated',
            template: {
              id: template.id,
              technicalName: template.templateType?.technicalName,
              subject: template.subject,
            },
            updated: Object.keys(updateData),
          }, null, 2),
        }],
      };
    },

    mail_template_send_test: async (args) => {
      const input = MailTemplateSendTestInput.parse(args);
      const result = await services.mailTemplate.sendTest(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: `Test mail sent to ${result.recipient}`,
            templateType: result.templateType,
          }, null, 2),
        }],
      };
    },
  };
}
