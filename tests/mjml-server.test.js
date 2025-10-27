import test from 'ava';
import got from 'got';

const BASE_URL = 'http://localhost:3000';

// ============ HEALTH CHECK TESTS ============

test('GET /health returns 200', async (t) => {
        const response = await got.get(`${BASE_URL}/health`, { retry: { limit: 0 } });

        t.is(response.statusCode, 200);
        t.is(JSON.parse(response.body).status, 'ok');
});

test('GET /health includes timestamp', async (t) => {
        const response = await got.get(`${BASE_URL}/health`);
        const body = JSON.parse(response.body);

        t.truthy(body.timestamp);
        t.truthy(new Date(body.timestamp));
});

// ============ INFO ENDPOINT TESTS ============

test('GET /info returns server info', async (t) => {
        const response = await got.get(`${BASE_URL}/info`);
        const body = JSON.parse(response.body);

        t.truthy(body.name);
        t.truthy(body.version);
        t.truthy(body.mjmlVersion);
        t.truthy(body.endpoints);
});

// ============ SINGLE RENDER TESTS ============

test('POST /render with valid MJML returns HTML', async (t) => {
        const mjml = `<mjml>
    <mj-head>
      <mj-title>Test</mj-title>
    </mj-head>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text>Hello</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>`;

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                retry: { limit: 0 },
        });

        t.is(response.statusCode, 200);
        const body = JSON.parse(response.body);
        t.truthy(body.html);
        t.true(body.html.includes('Hello'));
});

test('POST /render with empty MJML returns 400', async (t) => {
        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml: '' },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 400);
        const body = JSON.parse(response.body);
        t.truthy(body.error);
});

test('POST /render without MJML field returns 400', async (t) => {
        const response = await got.post(`${BASE_URL}/render`, {
                json: {},
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 400);
        const body = JSON.parse(response.body);
        t.truthy(body.error);
});

test('POST /render with oversized MJML returns 413', async (t) => {
        const oversizedMjml = 'x'.repeat(1024 * 1024 + 1);

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml: oversizedMjml },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 413);
        const body = JSON.parse(response.body);
        t.is(body.code, 'CONTENT_TOO_LARGE');
});

test('POST /render with invalid MJML returns compilation errors', async (t) => {
        const mjml = `<mjml>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-invalid></mj-invalid>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>`;

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 400);
        const body = JSON.parse(response.body);
        t.is(body.code, 'COMPILATION_ERROR');
        t.truthy(body.errors);
        t.true(body.errors.length > 0);
});

test('POST /render preserves Twig variables', async (t) => {
        const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text>{{ user.name }}</mj-text></mj-column></mj-section></mj-body></mjml>';

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                retry: { limit: 0 },
        });

        const body = JSON.parse(response.body);
        t.true(body.html.includes('{{ user.name }}'));
});

test('POST /render handles special characters', async (t) => {
        const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text>Bonjour à toi! 🎉</mj-text></mj-column></mj-section></mj-body></mjml>';

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                retry: { limit: 0 },
        });

        t.is(response.statusCode, 200);
        const body = JSON.parse(response.body);
        t.true(body.html.includes('Bonjour'));
});

test('POST /render with complex template works', async (t) => {
        const mjml = `
    <mjml>
      <mj-head>
        <mj-title>Welcome</mj-title>
        <mj-preview>Thanks for joining</mj-preview>
      </mj-head>
      <mj-body>
        <mj-section background-color="#f4eee3">
          <mj-column>
            <mj-text align="center" font-size="48px">Welcome!</mj-text>
          </mj-column>
        </mj-section>
        <mj-section>
          <mj-column>
            <mj-text>Thanks for joining our community</mj-text>
            <mj-button href="https://example.com">Confirm</mj-button>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `;

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                retry: { limit: 0 },
        });

        t.is(response.statusCode, 200);
        const body = JSON.parse(response.body);
        t.true(body.html.length > 100);
        t.true(body.html.includes('Welcome'));
});

// ============ BATCH RENDER TESTS ============

test('POST /render-batch with multiple items returns results', async (t) => {
        const validMjml = `<mjml>
    <mj-head>
      <mj-title>Email</mj-title>
    </mj-head>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text>Content</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>`;

        const items = [
                { id: '1', mjml: validMjml.replace('Content', 'Email 1') },
                { id: '2', mjml: validMjml.replace('Content', 'Email 2') },
        ];

        const response = await got.post(`${BASE_URL}/render-batch`, {
                json: { items },
                retry: { limit: 0 },
        });

        t.is(response.statusCode, 200);
        const body = JSON.parse(response.body);
        t.truthy(body.summary);
        t.is(body.summary.success, 2);
        t.is(body.results.length, 2);
        t.is(body.results[0].id, 1);
        t.is(body.results[1].id, 2);
});

test('POST /render-batch with empty items returns 400', async (t) => {
        const response = await got.post(`${BASE_URL}/render-batch`, {
                json: { items: [] },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 400);
});


test('POST /render-batch with partial failures returns mixed results', async (t) => {
        const items = [
                { id: '1', mjml: '<mjml><mj-body><mj-section><mj-column><mj-text>Valid</mj-text></mj-column></mj-section></mj-body></mjml>' },
                { id: '2', mjml: '<mjml><mj-invalid></mj-invalid></mjml>' },
        ];

        const response = await got.post(`${BASE_URL}/render-batch`, {
                json: { items },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 200);
        const body = JSON.parse(response.body);
        t.is(body.results[0].success, true);
        t.is(body.results[1].success, false);
});

test('POST /render-batch returns summary', async (t) => {
        const items = [
                { id: '1', mjml: '<mjml><mj-body><mj-section><mj-column><mj-text>Email</mj-text></mj-column></mj-section></mj-body></mjml>' },
        ];

        const response = await got.post(`${BASE_URL}/render-batch`, {
                json: { items },
                retry: { limit: 0 },
        });

        const body = JSON.parse(response.body);
        t.truthy(body.summary);
        t.truthy(body.summary.total);
        t.truthy(body.summary.success);
        t.truthy(body.summary.failed !== undefined);
});

// ============ 404 TESTS ============

test('GET /nonexistent returns 404', async (t) => {
        const response = await got.get(`${BASE_URL}/nonexistent`, {
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        t.is(response.statusCode, 404);
        const body = JSON.parse(response.body);
        t.is(body.code, 'NOT_FOUND');
});

// ============ PERFORMANCE TESTS ============

test('Single render completes in reasonable time', async (t) => {
        const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text>Test</mj-text></mj-column></mj-section></mj-body></mjml>';

        const start = Date.now();
        await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                retry: { limit: 0 },
        });
        const duration = Date.now() - start;

        t.true(duration < 5000, `Render took ${duration}ms, expected < 5000ms`);
});

test('Batch render with 10 items completes in reasonable time', async (t) => {
        const items = Array(10).fill(null).map((_, i) => ({
                id: String(i),
                mjml: '<mjml><mj-body><mj-section><mj-column><mj-text>Email</mj-text></mj-column></mj-section></mj-body></mjml>',
        }));

        const start = Date.now();
        await got.post(`${BASE_URL}/render-batch`, {
                json: { items },
                retry: { limit: 0 },
        });
        const duration = Date.now() - start;

        t.true(duration < 15000, `Batch render took ${duration}ms, expected < 15000ms`);
});

// ============ CONTENT TYPE TESTS ============

test('POST /render with correct content-type', async (t) => {
        const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text>Test</mj-text></mj-column></mj-section></mj-body></mjml>';

        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml },
                headers: { 'content-type': 'application/json' },
                retry: { limit: 0 },
        });

        t.is(response.statusCode, 200);
        t.true(response.headers['content-type'].includes('application/json'));
});

// ============ ERROR RESPONSE TESTS ============

test('Error responses include code field', async (t) => {
        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml: '' },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        const body = JSON.parse(response.body);
        t.truthy(body.code);
});

test('Error responses include error field', async (t) => {
        const response = await got.post(`${BASE_URL}/render`, {
                json: { mjml: '' },
                retry: { limit: 0 },
                throwHttpErrors: false,
        });

        const body = JSON.parse(response.body);
        t.truthy(body.error);
});
