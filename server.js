import Fastify from 'fastify';
import mjml2html from 'mjml';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  },
});

// ============ SCHEMAS DE VALIDATION ============

const renderSchema = {
  body: {
    type: 'object',
    required: ['mjml'],
    properties: {
      mjml: {
        type: 'string',
        description: 'MJML content to render',
      },
    },
  },
};

const batchRenderSchema = {
  body: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            {
              type: 'object',
              required: ['id', 'mjml'],
              properties: {
                id: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
                mjml: {
                  type: 'string',
                },
              },
            },
            {
              type: 'object',
              required: ['mjml'],
              properties: {
                mjml: {
                  type: 'string',
                },
              },
            },
          ],
        },
      },
    },
  },
};

// ============ ROUTES ============

/**
 * Hook pour vérifier la taille du payload avant la validation du schéma
 */
fastify.addHook('preHandler', async (request, reply) => {
  if (request.url === '/render-batch' && request.method === 'POST') {
    try {
      const body = request.body;
      if (body && body.items && Array.isArray(body.items) && body.items.length > 100) {
        return reply.code(413).send({
          error: 'Too many items (max 100 at once)',
          code: 'TOO_MANY_ITEMS',
        });
      }
    } catch (error) {
      // Continuer normalement si erreur
    }
  }
});

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});

/**
 * Single MJML render endpoint
 * POST /render
 *
 * Body: { mjml: string }
 * Response: { html: string }
 */
fastify.post('/render', { schema: renderSchema }, async (request, reply) => {
  try {
    const { mjml } = request.body;

    // Validate input
    if (!mjml || typeof mjml !== 'string') {
      fastify.log.warn('Invalid MJML input');
      return reply.code(400).send({
        error: 'MJML content is required and must be a string',
        code: 'INVALID_INPUT',
      });
    }

    // Check size (1MB max)
    if (mjml.length > 1024 * 1024) {
      fastify.log.warn('MJML content too large', { size: mjml.length });
      return reply.code(413).send({
        error: 'MJML content is too large (max 1MB)',
        code: 'CONTENT_TOO_LARGE',
      });
    }

    fastify.log.debug('Rendering MJML', { size: mjml.length });

    // Render MJML
    const { html, errors } = mjml2html(mjml, {
      validationLevel: 'soft',
      filePath: '.',
    });

    // Handle compilation errors
    if (errors && errors.length > 0) {
      fastify.log.warn('MJML compilation errors', {
        errorCount: errors.length,
        errors: errors.slice(0, 5), // Log first 5 errors
      });

      return reply.code(400).send({
        error: 'MJML compilation failed',
        code: 'COMPILATION_ERROR',
        errors: errors.map((e) => ({
          line: e.line,
          message: e.message,
          tagName: e.tagName,
        })),
      });
    }

    if (!html || typeof html !== 'string') {
      fastify.log.error('No HTML generated');
      return reply.code(500).send({
        error: 'Failed to generate HTML',
        code: 'NO_OUTPUT',
      });
    }

    fastify.log.info('MJML rendered successfully', { htmlSize: html.length });

    reply.header('Content-Type', 'application/json');
    return { html };
  } catch (error) {
    fastify.log.error('Unexpected error during rendering', {
      message: error.message,
      stack: error.stack,
    });

    return reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * Batch MJML render endpoint
 * POST /render-batch
 *
 * Body: { items: Array<{ id?: string|number, mjml: string }> }
 * Response: { results: Array<{ id, success, html?, errors? }> }
 */
fastify.post('/render-batch', { schema: batchRenderSchema }, async (request, reply) => {
  try {
    const { items } = request.body;

    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({
        error: 'items array is required and must contain at least 1 item',
        code: 'INVALID_INPUT',
      });
    }

    fastify.log.info('Processing batch render', { itemCount: items.length });

    const results = items.map((item, index) => {
      try {
        const id = item.id !== undefined ? item.id : index;
        const { mjml } = item;

        if (mjml.length > 1024 * 1024) {
          return {
            id,
            success: false,
            error: 'MJML content is too large (max 1MB)',
            code: 'CONTENT_TOO_LARGE',
          };
        }

        const { html, errors } = mjml2html(mjml, {
          validationLevel: 'soft',
          filePath: '.',
        });

        if (errors && errors.length > 0) {
          return {
            id,
            success: false,
            error: 'MJML compilation failed',
            code: 'COMPILATION_ERROR',
            errors: errors.map((e) => ({
              line: e.line,
              message: e.message,
              tagName: e.tagName,
            })),
          };
        }

        return {
          id,
          success: true,
          html,
        };
      } catch (error) {
        fastify.log.error('Batch item error', {
          id: item.id ?? index,
          message: error.message,
        });

        return {
          id: item.id ?? index,
          success: false,
          error: error.message,
          code: 'PROCESSING_ERROR',
        };
      }
    });

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    fastify.log.info('Batch render completed', {
      successCount,
      failureCount,
    });

    return {
      summary: {
        total: results.length,
        success: successCount,
        failed: failureCount,
      },
      results,
    };
  } catch (error) {
    fastify.log.error('Unexpected error during batch rendering', {
      message: error.message,
      stack: error.stack,
    });

    return reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * Info endpoint - returns server info
 */
fastify.get('/info', async (request, reply) => {
  return {
    name: 'MJML Rendering Server',
    version: '1.0.0',
    mjmlVersion: '4.14.1',
    nodeVersion: process.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    endpoints: {
      health: { method: 'GET', path: '/health' },
      render: { method: 'POST', path: '/render' },
      renderBatch: { method: 'POST', path: '/render-batch' },
      info: { method: 'GET', path: '/info' },
    },
  };
});

/**
 * 404 handler
 */
fastify.setNotFoundHandler((request, reply) => {
  return reply.code(404).send({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: request.url,
  });
});

/**
 * Error handler - gère les erreurs de validation de schéma et autres erreurs
 */
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error('Request error', {
    message: error.message,
    statusCode: error.statusCode,
    url: request.url,
    code: error.code,
  });

  // Gère les erreurs de validation de schéma JSON
  if (error.statusCode === 400 && error.code === 'FST_ERR_VALIDATION') {
    return reply.code(400).send({
      error: error.message || 'Validation error',
      code: 'INVALID_INPUT',
    });
  }

  // Gère les erreurs de payload trop volumineux
  if (error.statusCode === 413) {
    return reply.code(413).send({
      error: error.message || 'Payload too large',
      code: 'CONTENT_TOO_LARGE',
    });
  }

  return reply.code(error.statusCode || 500).send({
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    statusCode: error.statusCode || 500,
  });
});

// ============ SERVER START ============

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    fastify.log.info(`🚀 MJML Server running`);
    fastify.log.info(`📍 Listening on http://${host}:${port}`);
    fastify.log.info(`🏥 Health check: GET http://${host}:${port}/health`);
    fastify.log.info(`📊 Info: GET http://${host}:${port}/info`);
  } catch (err) {
    fastify.log.error('Failed to start server', {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  fastify.log.info('SIGTERM received, shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  fastify.log.info('SIGINT received, shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});

start();

export default fastify;
