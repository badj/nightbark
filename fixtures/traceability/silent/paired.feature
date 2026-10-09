# FIXTURE — near miss. One scenario may legitimately carry SEVERAL ids: a progression case paired
# onto existing coverage rather than duplicated. Several ids on ONE test is fine; one id on several
# tests is the defect.
@regression
Feature: Login smoke

  @[700120] @[700121] @[700122] @SMK-X01
  Scenario: A registered customer signs in and lands on the dashboard
    Given a registered customer
    Then the dashboard loads
