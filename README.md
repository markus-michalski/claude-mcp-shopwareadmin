# claude-mcp-shopwareadmin

MCP Server for Shopware 6 product and content management via Claude Code.

## Features

### Product Management (6 Tools)
- `product_create` - Create products (always inactive for safety)
- `product_get` - Read product details with variants, media, properties
- `product_list` - List products with filters (category, status, search)
- `product_update` - Update product data (name, price, description, etc.)
- `product_set_active` - Activate/deactivate products
- `search_products` - Full-text search across products

### Content Generation (4 Tools)
- `product_generate_content` - Generate product description prompts with auto style detection
- `product_generate_seo` - Generate SEO metadata (title, description, keywords)
- `variant_generate_content` - Generate variant-specific descriptions
- `content_update` - Save generated content to products

### Category Management (3 Tools)
- `category_list` - Browse category tree structure
- `category_get` - Get category details with optional products
- `category_generate_content` - Generate SEO text prompts for categories

### Helper Functions (3 Tools)
- `get_properties` - List available property groups and options
- `get_manufacturers` - List manufacturers/brands
- `snippet_list` - List product snippets (for software descriptions via mmd-product-snippets plugin)

**Total: 16 MCP Tools**

## Installation

```bash
# Clone repository
git clone <repo-url> claude-mcp-shopwareadmin
cd claude-mcp-shopwareadmin

# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your Shopware credentials

# Build
npm run build
```

## Configuration

Create a `.env` file with:

```env
SHOPWARE_URL=https://your-shop.com
SHOPWARE_CLIENT_ID=SWIA...
SHOPWARE_CLIENT_SECRET=...
WIKIJS_BASE_URL=https://your-wiki.com
LOG_LEVEL=info
```

### Shopware Integration Setup

1. Go to Admin > Settings > System > Integrations
2. Create new integration
3. Set permissions:
   - product: read, write
   - category: read
   - property_group: read
   - product_manufacturer: read
   - tax: read
   - currency: read
4. Copy Client ID and Secret to `.env`

## Usage with Claude Code

### Claude Code Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "shopwareadmin": {
      "command": "node",
      "args": ["/home/YOUR_USER/.claude/mcp-servers/shopwareadmin/dist/index.js"],
      "env": {}
    }
  }
}
```

Or register via CLI:

```bash
claude mcp add --scope user --transport stdio shopwareadmin -- \
  node ~/.claude/mcp-servers/shopwareadmin/dist/index.js
```

### Example Usage

```
> List all inactive products in category "Software"
> Create a new product "ALTCHA Forms Plugin" with price 49.00 in category "Shopware 6"
> Generate SEO description for product SW-ALTCHA-001
> Activate product with ID abc-123
```

## Style Profiles

### Creative (Embroidery, Sewing, 3D Printing)
- Tone: Personal, warm, emotional
- Addressing: "du" (informal German)
- Structure: Emotional intro > What is it > Technical details > Tips

### Software (OXID, Shopware Plugins)
- Tone: Professional, solution-oriented
- Addressing: "Sie" (formal German)
- Structure: Problem > Solution > Features (table) > Requirements > Docs

Style is auto-detected from category path:
- `Software/*` -> software style
- `Stickdateien/*` -> creative style
- `Genaehtes/*` -> creative style
- `3D-Druck/*` -> creative style

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Development mode
npm run dev

# Run tests
npm test
```

## License

MIT

## Author

Markus Michalski
