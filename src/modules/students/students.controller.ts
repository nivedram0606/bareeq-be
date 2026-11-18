import {
  createStudentSchema,
  idParamSchema,
  studentListQuerySchema,
  updateStudentSchema,
} from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { studentsService } from './students.service.js';

export const studentsController = {
  list: handle({ query: studentListQuerySchema }, ({ user, query }) =>
    studentsService.list(user, query),
  ),

  get: handle({ params: idParamSchema }, ({ user, params }) =>
    studentsService.get(user, params.id),
  ),

  create: handle(
    { body: createStudentSchema },
    ({ user, body }) => studentsService.create(user, body),
    { status: 201 },
  ),

  update: handle({ params: idParamSchema, body: updateStudentSchema }, ({ user, params, body }) =>
    studentsService.update(user, params.id, body),
  ),
};
