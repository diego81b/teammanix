import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { IsPushEndpoint } from './push-endpoint.rules';

/** The three channels the person chooses for a club. All required: a partial body would hide which one is meant. */
export class PreferenceDto {
  @IsBoolean()
  inApp!: boolean;

  @IsBoolean()
  email!: boolean;

  @IsBoolean()
  push!: boolean;
}

class SubscriptionKeysDto {
  @IsString()
  @Length(1, 200)
  p256dh!: string;

  @IsString()
  @Length(1, 100)
  auth!: string;
}

/** What `PushManager.subscribe()` returns, as the browser serializes it. The endpoint must be a known push service (SSRF). */
export class SubscriptionDto {
  @IsPushEndpoint()
  @MaxLength(2000)
  endpoint!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => SubscriptionKeysDto)
  keys!: SubscriptionKeysDto;
}

export class EndpointDto {
  @IsString()
  @MaxLength(2000)
  endpoint!: string;
}
