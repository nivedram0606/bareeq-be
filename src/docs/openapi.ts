import { z } from 'zod';

import {
  academicYearSchema,
  apiErrorSchema,
  brandingSchema,
  changePasswordSchema,
  classListQuerySchema,
  classSchema,
  createAcademicYearSchema,
  createClassSchema,
  createFeeSchema,
  createGuardianSchema,
  createPaymentSchema,
  createStaffSchema,
  createStudentSchema,
  createUserSchema,
  dashboardSchema,
  feeCollectionQuerySchema,
  feeCollectionReportSchema,
  feeItemSchema,
  guardianSchema,
  healthResponseSchema,
  listQuerySchema,
  loginResponseSchema,
  loginSchema,
  meSchema,
  orgSchema,
  outstandingQuerySchema,
  outstandingReportSchema,
  paginated,
  paymentSchema,
  profileSchema,
  resetUserPasswordSchema,
  setupAdminSchema,
  staffListQuerySchema,
  staffSchema,
  studentFeesSchema,
  studentListQuerySchema,
  studentReportQuerySchema,
  studentReportSchema,
  studentSchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateFeeSchema,
  updateGuardianSchema,
  updateOrgSchema,
  updateStaffSchema,
  updateStudentSchema,
  updateUserSchema,
  voidPaymentSchema,
} from '@bareeq/shared';

/**
 * OpenAPI 3.1 description of the API, generated from the same Zod schemas the routes validate
 * with (`@bareeq/shared`), so the docs cannot drift from the real request/response shapes.
 * Keep `ROUTES` in sync when adding or changing an endpoint (a test checks every route is listed).
 */

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Access = 'public' | 'any' | 'staff' | 'admin';
type JsonSchema = Record<string, unknown>;

interface RouteDoc {
  method: Method;
  /** Express-style path relative to `/api/v1`, e.g. `/students/:id`. */
  path: string;
  tag: string;
  summary: string;
  access: Access;
  description?: string;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Response body for the success status; omitted for 204 / file responses. */
  response?: z.ZodType;
  status?: 200 | 201 | 204;
  /** Non-JSON success response (CSV, ZIP, image). */
  file?: { contentType: string; description: string };
  /** Request body is multipart with a single file field. */
  upload?: { field: string; description: string };
  /** Extra non-auth error responses worth documenting. */
  errors?: Partial<Record<400 | 403 | 404 | 409 | 429, string>>;
}

const ACCESS_TEXT: Record<Access, string> = {
  public: 'Public — no token needed.',
  any: 'Any signed-in user.',
  staff: 'Roles: admin, staff.',
  admin: 'Role: admin.',
};

const list = <T extends z.ZodType>(item: T) => paginated(item);

export const ROUTES: RouteDoc[] = [
  /* -------------------------------------------------------------- system */
  {
    method: 'get',
    path: '/health',
    tag: 'System',
    summary: 'Health check',
    access: 'public',
    response: healthResponseSchema,
  },
  {
    method: 'get',
    path: '/branding',
    tag: 'System',
    summary: 'School name, colour and logo for the sign-in page',
    access: 'public',
    response: brandingSchema,
  },
  {
    method: 'get',
    path: '/orgs/:id/logo',
    tag: 'System',
    summary: "An organization's logo image",
    access: 'public',
    file: { contentType: 'image/*', description: 'PNG, JPEG or SVG image' },
    errors: { 404: 'No logo uploaded' },
  },
  {
    method: 'post',
    path: '/setup/admin',
    tag: 'System',
    summary: 'One-time creation of the school and its first admin',
    access: 'public',
    description:
      'Disabled (404) unless `SETUP_TOKEN` is configured. Send the token in the `X-Setup-Token` header. Returns 409 once any admin exists.',
    body: setupAdminSchema,
    response: profileSchema,
    status: 201,
    errors: { 403: 'Missing or wrong setup token', 404: 'Setup disabled', 409: 'Admin exists' },
  },

  /* ---------------------------------------------------------------- auth */
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Sign in with username and password',
    access: 'public',
    description:
      'Returns a session token; send it as `Authorization: Bearer <token>`. Wrong usernames and wrong passwords both give 401. Limited to 10 failed attempts per IP per 15 minutes. One active session per user: signing in here signs that user out everywhere else (including the web app).',
    body: loginSchema,
    response: loginResponseSchema,
    errors: { 403: 'Account deactivated', 429: 'Too many failed attempts' },
  },
  {
    method: 'post',
    path: '/auth/change-password',
    tag: 'Auth',
    summary: 'Change your own password',
    access: 'any',
    description:
      'Signs out every other session of this user and returns a fresh token for the current one.',
    body: changePasswordSchema,
    response: loginResponseSchema,
    errors: { 400: 'Current password is wrong, or new password too short' },
  },
  {
    method: 'get',
    path: '/me',
    tag: 'Auth',
    summary: 'The signed-in user and their organization',
    access: 'any',
    response: meSchema,
  },

  /* --------------------------------------------------------------- users */
  {
    method: 'get',
    path: '/users',
    tag: 'Users',
    summary: 'List users',
    access: 'admin',
    query: listQuerySchema,
    response: list(profileSchema),
  },
  {
    method: 'post',
    path: '/users',
    tag: 'Users',
    summary: 'Create a user with a username and initial password',
    access: 'admin',
    body: createUserSchema,
    response: profileSchema,
    status: 201,
    errors: { 409: 'Username taken' },
  },
  {
    method: 'patch',
    path: '/users/:id',
    tag: 'Users',
    summary: 'Change role or active status',
    access: 'admin',
    body: updateUserSchema,
    response: profileSchema,
    errors: { 404: 'User not found', 409: 'Cannot demote or deactivate yourself' },
  },
  {
    method: 'put',
    path: '/users/:id/password',
    tag: 'Users',
    summary: "Reset a user's password",
    access: 'admin',
    description: 'Signs the user out of every session.',
    body: resetUserPasswordSchema,
    status: 204,
    errors: { 404: 'User not found' },
  },

  /* ---------------------------------------------------------------- org */
  {
    method: 'get',
    path: '/org',
    tag: 'Organization',
    summary: 'Your organization',
    access: 'any',
    response: orgSchema,
  },
  {
    method: 'patch',
    path: '/org',
    tag: 'Organization',
    summary: 'Update name, language or brand colour',
    access: 'admin',
    body: updateOrgSchema,
    response: orgSchema,
  },
  {
    method: 'post',
    path: '/org/logo',
    tag: 'Organization',
    summary: 'Upload the school logo',
    access: 'admin',
    upload: { field: 'logo', description: 'PNG, JPEG or SVG, at most 1 MB' },
    response: orgSchema,
  },

  /* ----------------------------------------------------- academic years */
  {
    method: 'get',
    path: '/academic-years',
    tag: 'Academic years',
    summary: 'List academic years',
    access: 'any',
    query: listQuerySchema,
    response: list(academicYearSchema),
  },
  {
    method: 'post',
    path: '/academic-years',
    tag: 'Academic years',
    summary: 'Create an academic year',
    access: 'admin',
    body: createAcademicYearSchema,
    response: academicYearSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/academic-years/:id',
    tag: 'Academic years',
    summary: 'Update an academic year (or make it current)',
    access: 'admin',
    body: updateAcademicYearSchema,
    response: academicYearSchema,
  },

  /* ------------------------------------------------------------- classes */
  {
    method: 'get',
    path: '/classes',
    tag: 'Classes',
    summary: 'List classes',
    access: 'any',
    query: classListQuerySchema,
    response: list(classSchema),
  },
  {
    method: 'post',
    path: '/classes',
    tag: 'Classes',
    summary: 'Create a class',
    access: 'staff',
    body: createClassSchema,
    response: classSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/classes/:id',
    tag: 'Classes',
    summary: 'Update a class',
    access: 'staff',
    body: updateClassSchema,
    response: classSchema,
  },

  /* ------------------------------------------------------------ students */
  {
    method: 'get',
    path: '/students',
    tag: 'Students',
    summary: 'List students',
    access: 'any',
    query: studentListQuerySchema,
    response: list(studentSchema),
  },
  {
    method: 'post',
    path: '/students',
    tag: 'Students',
    summary: 'Create a student',
    access: 'staff',
    body: createStudentSchema,
    response: studentSchema,
    status: 201,
    errors: { 409: 'Admission number already used' },
  },
  {
    method: 'get',
    path: '/students/:id',
    tag: 'Students',
    summary: 'Get a student',
    access: 'any',
    response: studentSchema,
  },
  {
    method: 'patch',
    path: '/students/:id',
    tag: 'Students',
    summary: 'Update a student',
    access: 'staff',
    body: updateStudentSchema,
    response: studentSchema,
  },

  /* ----------------------------------------------------------- guardians */
  {
    method: 'get',
    path: '/students/:id/guardians',
    tag: 'Guardians',
    summary: "List a student's guardians",
    access: 'any',
    response: z.array(guardianSchema),
  },
  {
    method: 'post',
    path: '/students/:id/guardians',
    tag: 'Guardians',
    summary: 'Add a guardian to a student',
    access: 'staff',
    body: createGuardianSchema,
    response: guardianSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/guardians/:id',
    tag: 'Guardians',
    summary: 'Update a guardian',
    access: 'staff',
    body: updateGuardianSchema,
    response: guardianSchema,
  },
  {
    method: 'delete',
    path: '/guardians/:id',
    tag: 'Guardians',
    summary: 'Remove a guardian',
    access: 'staff',
    status: 204,
  },

  /* ---------------------------------------------------------------- fees */
  {
    method: 'get',
    path: '/students/:id/fees',
    tag: 'Fees & payments',
    summary: "A student's fees, payments and balance",
    access: 'any',
    response: studentFeesSchema,
  },
  {
    method: 'post',
    path: '/fees',
    tag: 'Fees & payments',
    summary: 'Add a fee item',
    access: 'staff',
    body: createFeeSchema,
    response: feeItemSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/fees/:id',
    tag: 'Fees & payments',
    summary: 'Update a fee item',
    access: 'staff',
    body: updateFeeSchema,
    response: feeItemSchema,
  },
  {
    method: 'post',
    path: '/payments',
    tag: 'Fees & payments',
    summary: 'Record a payment',
    access: 'staff',
    body: createPaymentSchema,
    response: paymentSchema,
    status: 201,
  },
  {
    method: 'post',
    path: '/payments/:id/void',
    tag: 'Fees & payments',
    summary: 'Void a payment',
    access: 'admin',
    description: 'Payments are never edited or deleted; a void is recorded in the audit log.',
    body: voidPaymentSchema,
    response: paymentSchema,
  },

  /* --------------------------------------------------------------- staff */
  {
    method: 'get',
    path: '/staff',
    tag: 'Staff',
    summary: 'List staff records',
    access: 'any',
    query: staffListQuerySchema,
    response: list(staffSchema),
  },
  {
    method: 'post',
    path: '/staff',
    tag: 'Staff',
    summary: 'Create a staff record',
    access: 'admin',
    body: createStaffSchema,
    response: staffSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/staff/:id',
    tag: 'Staff',
    summary: 'Update a staff record',
    access: 'admin',
    body: updateStaffSchema,
    response: staffSchema,
  },

  /* ------------------------------------------------------------- reports */
  {
    method: 'get',
    path: '/dashboard',
    tag: 'Reports',
    summary: 'Dashboard totals and recent payments',
    access: 'any',
    response: dashboardSchema,
  },
  {
    method: 'get',
    path: '/reports/students',
    tag: 'Reports',
    summary: 'Student listing report',
    access: 'any',
    query: studentReportQuerySchema,
    response: studentReportSchema,
  },
  {
    method: 'get',
    path: '/reports/students.csv',
    tag: 'Reports',
    summary: 'Student listing report as CSV',
    access: 'any',
    query: studentReportQuerySchema,
    file: { contentType: 'text/csv', description: 'UTF-8 CSV with BOM' },
  },
  {
    method: 'get',
    path: '/reports/fee-collection',
    tag: 'Reports',
    summary: 'Fee collection report',
    access: 'any',
    query: feeCollectionQuerySchema,
    response: feeCollectionReportSchema,
  },
  {
    method: 'get',
    path: '/reports/fee-collection.csv',
    tag: 'Reports',
    summary: 'Fee collection report as CSV',
    access: 'any',
    query: feeCollectionQuerySchema,
    file: { contentType: 'text/csv', description: 'UTF-8 CSV with BOM' },
  },
  {
    method: 'get',
    path: '/reports/outstanding',
    tag: 'Reports',
    summary: 'Outstanding balances report',
    access: 'any',
    query: outstandingQuerySchema,
    response: outstandingReportSchema,
  },
  {
    method: 'get',
    path: '/reports/outstanding.csv',
    tag: 'Reports',
    summary: 'Outstanding balances report as CSV',
    access: 'any',
    query: outstandingQuerySchema,
    file: { contentType: 'text/csv', description: 'UTF-8 CSV with BOM' },
  },
  {
    method: 'get',
    path: '/export',
    tag: 'Reports',
    summary: 'Download all school data (one CSV per table, zipped)',
    access: 'admin',
    description: 'Password hashes, session data and logo bytes are never included.',
    file: { contentType: 'application/zip', description: 'ZIP archive of CSV files' },
  },
];

/* ------------------------------------------------------------ generation */

const toSchema = (schema: z.ZodType, io: 'input' | 'output'): JsonSchema => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
  }) as JsonSchema;
  return rest;
};

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

/** Turns a Zod object schema for the query string into OpenAPI parameters. */
function queryParameters(schema: z.ZodType): JsonSchema[] {
  const json = toSchema(schema, 'input');
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: prop,
  }));
}

function operation(route: RouteDoc): JsonSchema {
  const parameters: JsonSchema[] = [];
  for (const [, name] of route.path.matchAll(/:([a-zA-Z]+)/g)) {
    parameters.push({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
  }
  if (route.query) parameters.push(...queryParameters(route.query));
  if (route.path === '/setup/admin') {
    parameters.push({
      name: 'X-Setup-Token',
      in: 'header',
      required: true,
      schema: { type: 'string' },
    });
  }

  const status = route.status ?? 200;
  const success: JsonSchema = { description: status === 204 ? 'No content' : 'Success' };
  if (route.file) {
    success.description = route.file.description;
    success.content = {
      [route.file.contentType]: { schema: { type: 'string', format: 'binary' } },
    };
  } else if (route.response) {
    success.content = { 'application/json': { schema: toSchema(route.response, 'output') } };
  }

  const responses: Record<string, JsonSchema> = { [status]: success };
  if (route.body || route.query || route.upload) {
    responses['400'] = errorResponse('Validation error — `details` maps fields to message keys');
  }
  if (route.access !== 'public') {
    responses['401'] = errorResponse('Missing, invalid or expired token');
    responses['403'] = errorResponse(
      route.access === 'any' ? 'Account deactivated' : 'Your role is not allowed',
    );
  }
  if (route.path.includes(':id') && !route.errors?.[404]) {
    responses['404'] = errorResponse('Not found (or belongs to another organization)');
  }
  for (const [code, description] of Object.entries(route.errors ?? {})) {
    responses[code] = errorResponse(description);
  }

  const op: JsonSchema = {
    tags: [route.tag],
    summary: route.summary,
    description: [ACCESS_TEXT[route.access], route.description].filter(Boolean).join('\n\n'),
    operationId: `${route.method}${route.path
      .replace(/[^a-zA-Z0-9:]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))
      .replace(/:([a-z])/g, (_m, c: string) => `By${c.toUpperCase()}`)}`,
    responses,
  };
  if (parameters.length) op.parameters = parameters;
  if (route.access === 'public') op.security = [];
  if (route.body) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: toSchema(route.body, 'input') } },
    };
  } else if (route.upload) {
    op.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: [route.upload.field],
            properties: {
              [route.upload.field]: {
                type: 'string',
                format: 'binary',
                description: route.upload.description,
              },
            },
          },
        },
      },
    };
  }
  return op;
}

/** Builds the OpenAPI document. `serverUrl` is the API base, e.g. `/api/v1`. */
export function buildOpenApiDocument(serverUrl = '/api/v1'): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const route of ROUTES) {
    const path = route.path.replace(/:([a-zA-Z]+)/g, '{$1}');
    (paths[path] ??= {})[route.method] = operation(route);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Bareeq Cloud API',
      version: '1.0.0',
      description:
        'School management API. Sign in with `POST /auth/login`, then click **Authorize** and paste the `token`. Money values are strings with 3 decimals (OMR). Every list is scoped to your organization.',
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    tags: [...new Set(ROUTES.map((r) => r.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'The `token` returned by `POST /auth/login`.',
        },
      },
      schemas: { Error: toSchema(apiErrorSchema, 'output') },
    },
  };
}
