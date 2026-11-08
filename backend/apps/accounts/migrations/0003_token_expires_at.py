from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_self_reported_agreement"),
    ]

    operations = [
        migrations.AddField(
            model_name="customeraccount",
            name="token_expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
