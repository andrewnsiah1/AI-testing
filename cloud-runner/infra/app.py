#!/usr/bin/env python3
"""CDK app entry point for the Cloud Runner infrastructure."""

import aws_cdk as cdk
from stacks.backend_stack import BackendStack

app = cdk.App()

BackendStack(
    app,
    "CloudRunnerStack",
    description="Cloud Runner - Serverless backend with Bedrock RAG for quiz generation and follow-up Q&A",
    env=cdk.Environment(
        region="us-east-1",  # Bedrock availability
    ),
)

app.synth()
