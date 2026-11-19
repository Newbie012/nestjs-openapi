## 0.12.0

### Minor Changes

- Security decorators now produce the same requirements as @nestjs/swagger: one requirement per decorator, any one of which is enough, with the method's added to the controller's. `@ApiSecurity({ apiKey: [], clientId: [] })` is now read as one requirement that needs both.
