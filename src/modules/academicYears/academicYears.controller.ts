import {
  createAcademicYearSchema,
  idParamSchema,
  listQuerySchema,
  updateAcademicYearSchema,
} from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { academicYearsService } from './academicYears.service.js';

export const academicYearsController = {
  list: handle({ query: listQuerySchema }, ({ user, query }) =>
    academicYearsService.list(user, query),
  ),

  create: handle(
    { body: createAcademicYearSchema },
    ({ user, body }) => academicYearsService.create(user, body),
    { status: 201 },
  ),

  update: handle(
    { params: idParamSchema, body: updateAcademicYearSchema },
    ({ user, params, body }) => academicYearsService.update(user, params.id, body),
  ),
};
