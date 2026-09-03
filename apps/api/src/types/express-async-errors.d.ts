// express-async-errors ships no types — it's a side-effect-only import that
// patches Express's Router methods so a rejected promise from an async
// route handler reaches the error middleware instead of hanging the
// request forever (Express 4 doesn't do this natively; Express 5 does).
declare module 'express-async-errors';
