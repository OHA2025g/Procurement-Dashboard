from kpi_registry import KPI_REGISTRY, REGISTRY_BY_ID


def test_registry_has_120_unique_ids():
    assert len(KPI_REGISTRY) == 120
    assert len(REGISTRY_BY_ID) == 120
