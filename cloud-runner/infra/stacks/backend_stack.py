"""CDK Stack for the Cloud Runner backend.

Provisions:
- S3 bucket for AWS documentation (Knowledge Base source)
- Lambda function running FastAPI (quiz generation, follow-up Q&A, grounded by RAG)
- API Gateway HTTP API
- IAM role with Bedrock InvokeModel + Retrieve access
"""

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_s3 as s3,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_apigatewayv2 as apigwv2,
)
from aws_cdk.aws_apigatewayv2_integrations import HttpLambdaIntegration
from constructs import Construct


class BackendStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Pull sensitive/environment-specific config from CDK context
        kb_id = self.node.try_get_context("kb_id") or ""
        game_url = self.node.try_get_context("game_url") or "http://localhost:3000"

        # ============================================================
        # S3 Bucket for AWS documentation (Knowledge Base data source)
        # Use existing bucket if it already exists
        # ============================================================
        docs_bucket = s3.Bucket.from_bucket_name(
            self,
            "DocsDataSource",
            bucket_name=f"cloud-runner-docs-{self.account}",
        )

        # ============================================================
        # Lambda Function (FastAPI via Mangum)
        # ============================================================
        api_lambda = lambda_.Function(
            self,
            "CloudRunnerApiFunction",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="app.main.handler",
            code=lambda_.Code.from_asset("../backend/package"),
            timeout=Duration.seconds(60),
            memory_size=512,
            environment={
                "BEDROCK_KNOWLEDGE_BASE_ID": kb_id,
                "BEDROCK_MODEL_ID": "anthropic.claude-3-sonnet-20240229-v1:0",
                "ALLOWED_ORIGINS": game_url,
            },
            description="Cloud Runner - FastAPI backend for quiz generation and follow-up Q&A, grounded by a Bedrock Knowledge Base",
        )

        # Grant Bedrock permissions (InvokeModel for generation, Retrieve for RAG)
        api_lambda.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:Retrieve",
                ],
                resources=["*"],  # Scope down to specific model/KB ARNs in production
            )
        )

        # Grant S3 read access (for potential direct doc access)
        docs_bucket.grant_read(api_lambda)

        # ============================================================
        # API Gateway HTTP API
        # ============================================================
        http_api = apigwv2.HttpApi(
            self,
            "CloudRunnerHttpApi",
            api_name="cloud-runner-api",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_origins=[game_url, "http://localhost:3000"],
                allow_methods=[apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
                allow_headers=["Content-Type", "Authorization"],
                max_age=Duration.hours(1),
            ),
            description="HTTP API for Cloud Runner's in-game AI features",
        )

        # Throttle: 10 requests/sec burst, 5 requests/sec sustained per client
        # This prevents someone from hammering the API and running up your Bedrock bill
        cfn_stage = http_api.default_stage.node.default_child
        cfn_stage.default_route_settings = apigwv2.CfnStage.RouteSettingsProperty(
            throttling_burst_limit=10,
            throttling_rate_limit=5,
        )

        # Lambda integration
        integration = HttpLambdaIntegration("LambdaIntegration", api_lambda)

        # Routes
        http_api.add_routes(
            path="/health",
            methods=[apigwv2.HttpMethod.GET],
            integration=integration,
        )
        http_api.add_routes(
            path="/quiz",
            methods=[apigwv2.HttpMethod.POST],
            integration=integration,
        )
        http_api.add_routes(
            path="/lane-quiz",
            methods=[apigwv2.HttpMethod.POST],
            integration=integration,
        )
        http_api.add_routes(
            path="/ask",
            methods=[apigwv2.HttpMethod.POST],
            integration=integration,
        )
        http_api.add_routes(
            path="/orb-note",
            methods=[apigwv2.HttpMethod.POST],
            integration=integration,
        )

        # ============================================================
        # Outputs
        # ============================================================
        CfnOutput(
            self,
            "ApiUrl",
            value=http_api.url or "",
            description="API Gateway endpoint URL - set this in subway-surfers-clone/src/quizApi.js",
        )
        CfnOutput(
            self,
            "DocsBucketName",
            value=docs_bucket.bucket_name,
            description="S3 bucket for uploading AWS documentation used by the Knowledge Base",
        )
