# FIXTURE — near miss. This test cannot run, and that is FINE because it carries no case id. The
# defect is a parked test that still PROMISES a case result, not a parked test as such.
@regression
Feature: Deferred work

  @wip @ado_700190
  Scenario: The resend limit shows the approved message
    Given the OTP screen
    Then the approved copy is shown
