# FIXTURE — must fire. Synthetic; see ADR-0003.
@regression
Feature: Checkout

  # FAULT 1a: this id is also on a scenario in cart.feature. Two tests, one case point.
  @[700101] @ATH01
  Scenario: A customer completes checkout with a saved card
    Given a customer with a saved card
    When they check out
    Then the order is confirmed

  # FAULT 2: an id on a test that cannot run. It will never publish, while reading as coverage.
  @[700102] @archived
  Scenario: The legacy one-click checkout is offered
    Given the legacy flow
    Then one-click is offered
