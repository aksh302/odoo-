import app from './app';
import { config } from './config';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Brightloop SMS server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Demo mode: ${config.demoMode ? 'ON' : 'OFF'}`);
  console.log(`AI enabled: ${config.ai.enabled ? 'ON' : 'OFF'}`);
});

