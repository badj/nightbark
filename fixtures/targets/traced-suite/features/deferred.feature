@regression
Feature: Scope decision

  @[700030] @outOfScope
  Scenario: The API rejects a malformed payload
    Given a malformed payload
    Then it is rejected
