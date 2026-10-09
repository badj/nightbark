@regression
Feature: Refund

  @[700002]
  Scenario: A refund returns to the original card
    Given a completed order
    Then the refund is issued
