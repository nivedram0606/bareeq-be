import {
  classListQuerySchema,
  createClassSchema,
  idParamSchema,
  updateClassSchema,
} from '@bareeq/shared';

import { handle } from '../../lib/http.js';

import { classesService } from './classes.service.js';

export const classesController = {
  list: handle({ query: classListQuerySchema }, ({ user, query }) =>
    classesService.list(user, query),
  ),

  create: handle(
    { body: createClassSchema },
    ({ user, body }) => classesService.create(user, body),
    {
      status: 201,
    },
  ),

  update: handle({ params: idParamSchema, body: updateClassSchema }, ({ user, params, body }) =>
    classesService.update(user, params.id, body),
  ),
};
