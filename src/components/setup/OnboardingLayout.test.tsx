import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { OnboardingLayout } from './OnboardingLayout';

test('the layout offers a cancel button only when the flow can be left', () => {
  const withoutCancel = renderToStaticMarkup(<OnboardingLayout><div>step</div></OnboardingLayout>);
  assert.doesNotMatch(withoutCancel, /Cancel setup/);

  const withCancel = renderToStaticMarkup(<OnboardingLayout onCancel={() => {}}><div>step</div></OnboardingLayout>);
  assert.match(withCancel, /aria-label="Cancel setup"/);
});
