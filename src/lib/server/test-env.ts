/**
 * Unit tests always run with machine translation on. TRANSLATE=off is set on non-production
 * stages (the build runs these tests with that stage's environment), so it is cleared here.
 * The one test that switches translation off sets it itself.
 */
delete process.env.TRANSLATE;
