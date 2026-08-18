// NestJS decorators (and the DTO metadata the ValidationPipe reads) require the
// reflect-metadata polyfill to be loaded before any decorated class is imported.
// main.ts does this for the running app; tests load it here.
import 'reflect-metadata';
