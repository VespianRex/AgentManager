/**
 * Mock for Model API Client - isolated to prevent test pollution.
 *
 * Use this in tests that need to mock the model API without affecting
 * other test files. Import this file instead of using vi.mock at module level.
 */

// Mock the sendPrompt method
const mockSendPrompt = () => Promise.resolve({
  text: "ok",
  tokensUsed: 4,
  finishReason: "stop",
  elapsedMs: 10,
  tokensPerSecond: 400,
});

export { mockSendPrompt };

// This mock module is used by tests that need to avoid real API calls
// Tests should import this and use vi.mock with vi.importActual or
// simply not import the real model-api module
