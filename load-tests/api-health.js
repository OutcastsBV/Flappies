import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';

export const options = {
  vus: 5,
  duration: '8s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3001';

export function setup() {
  const health = http.get(`${API_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`API not reachable at ${API_URL}/health`);
  }
}

export default function () {
  const res = http.get(`${API_URL}/health`);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.05);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
