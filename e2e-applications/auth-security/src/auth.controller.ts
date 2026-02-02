import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

export class LoginDto {
  username: string;
  password: string;
}

export class TokenDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class UserProfileDto {
  id: string;
  username: string;
  email: string;
  roles: string[];
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  @Post('login')
  @ApiOperation({ summary: 'Authenticate user and get tokens' })
  @ApiResponse({ status: 200, description: 'Login successful', type: TokenDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() _loginDto: LoginDto): TokenDto {
    return {
      accessToken: 'jwt-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    };
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get current user profile (requires authentication)',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(): UserProfileDto {
    return {
      id: '1',
      username: 'john',
      email: 'john@example.com',
      roles: ['user'],
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed', type: TokenDto })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  refreshToken(): TokenDto {
    return {
      accessToken: 'new-jwt-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    };
  }
}
