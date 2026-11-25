// SDD 12: each adapter in this folder turns network or response errors of its service into this
// error, so the services decide what to do when the service is down.
export class ExternalServiceUnavailable extends Error {
  service: string

  constructor(service: string, cause?: unknown) {
    super(`${service} is unavailable`, { cause })
    this.name = 'ExternalServiceUnavailable'
    this.service = service
  }
}