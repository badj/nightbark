@regression
Feature: Deferred work

  @wip @ado_700099
  Scenario: The resend limit shows the approved copy
    Given the OTP screen
    Then the approved copy is shown
