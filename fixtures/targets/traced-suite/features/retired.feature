@regression
Feature: Retired coverage

  @[700003] @archived
  Scenario: The legacy one-click flow is offered
    Given the legacy flow
    Then one-click is offered
