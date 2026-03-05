import { Effect, Layer, Logger, LogLevel } from 'effect';
import type { TelemetryConfig } from './types.js';

const DEFAULT_SERVICE_NAME = 'nestjs-openapi';
const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';

const loggerLayerFor = (debug: boolean) =>
  debug
    ? Logger.replace(Logger.defaultLogger, Logger.prettyLoggerDefault).pipe(
        Layer.merge(Logger.minimumLogLevel(LogLevel.Debug)),
      )
    : Logger.minimumLogLevel(LogLevel.Info);

const telemetryLayerFor = (
  telemetry: TelemetryConfig | undefined,
): Layer.Layer<never> => {
  if (!telemetry?.enabled) {
    return Layer.empty;
  }

  return Layer.unwrapEffect(
    Effect.fn('RuntimeLayer.telemetryLayerFor')(function* (
      inputTelemetry: TelemetryConfig,
    ) {
      const NodeSdk = yield* Effect.promise(() =>
        import('@effect/opentelemetry/NodeSdk'),
      );
      const serviceName = inputTelemetry.serviceName ?? DEFAULT_SERVICE_NAME;
      const exporter = inputTelemetry.exporter ?? 'console';

      if (exporter === 'otlp') {
        const endpoint =
          inputTelemetry.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
        const [{ OTLPTraceExporter }, { BatchSpanProcessor }] =
          yield* Effect.all([
            Effect.promise(() =>
              import('@opentelemetry/exporter-trace-otlp-http'),
            ),
            Effect.promise(() => import('@opentelemetry/sdk-trace-base')),
          ]);

        return NodeSdk.layer(() => ({
          resource: { serviceName },
          spanProcessor: new BatchSpanProcessor(
            new OTLPTraceExporter({ url: endpoint }),
          ),
        }));
      }

      const { ConsoleSpanExporter, SimpleSpanProcessor } = yield* Effect.promise(
        () => import('@opentelemetry/sdk-trace-base'),
      );

      return NodeSdk.layer(() => ({
        resource: { serviceName },
        spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
      }));
    })(telemetry),
  );
};

export const runtimeLayerFor = (
  debug: boolean,
  telemetry: TelemetryConfig | undefined,
): Layer.Layer<never> =>
  Layer.mergeAll(loggerLayerFor(debug), telemetryLayerFor(telemetry));
