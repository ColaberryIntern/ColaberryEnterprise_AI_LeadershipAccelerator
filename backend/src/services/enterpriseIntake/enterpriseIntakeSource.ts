/**
 * W28: the `source` an Enterprise intake call is placed under. It picks the call script
 * (callbackRequestService), the agent (synthflowService.resolveAgentId) and the completion
 * path (flotationCallCompletion). Kept in its own module so those three can import it
 * without importing the intake service and its models.
 */
export const ENTERPRISE_INTAKE_SOURCE = 'enterprise-intake';
