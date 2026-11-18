import {
  createStaffSchema,
  idParamSchema,
  staffListQuerySchema,
  updateStaffSchema,
} from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { staffService } from './staff.service.js';

export const staffController = {
  list: handle({ query: staffListQuerySchema }, ({ user, query }) =>
    staffService.list(user, query),
  ),

  create: handle({ body: createStaffSchema }, ({ user, body }) => staffService.create(user, body), {
    status: 201,
  }),

  update: handle({ params: idParamSchema, body: updateStaffSchema }, ({ user, params, body }) =>
    staffService.update(user, params.id, body),
  ),
};
